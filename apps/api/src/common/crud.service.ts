import { getRequestContext, versionBump, Prisma } from '@fabriq/database';
import { PrismaService } from '../prisma/prisma.service';
import { ListQueryDto } from './pagination.dto';
import { buildListArgs, buildPaginationMeta, ListOptions } from './list-args';

/**
 * Generic CRUD base shared by every business module service. Concrete
 * services declare the Prisma model name and inherit list/get/create/update/
 * archive with:
 *   • automatic tenant scoping (via PrismaService.client)
 *   • soft delete (isDeleted) on archive
 *   • audit stamping (createdBy/updatedBy from the request context)
 *   • optimistic version bumps
 */
export abstract class CrudService {
  protected abstract readonly model: string;

  /** Sensitive columns excluded from list/getById projections (e.g. passwordHash). */
  protected get omitFields(): string[] {
    return [];
  }

  constructor(protected readonly prisma: PrismaService) {}

  /**
   * Builds a full scalar-field `select` with sensitive columns (e.g.
   * passwordHash) set to false. A select of only `false` values is rejected by
   * Prisma, so we include every scalar field of the model. (Prisma's `omit`
   * option is not supported by the tenant-scoped `$extends` client.)
   */
  private omitSelect(): Record<string, boolean> | undefined {
    const omit = this.omitFields;
    if (omit.length === 0) return undefined;
    const enumKey = `${this.model}ScalarFieldEnum` as keyof typeof Prisma;
    const scalarFields = (Prisma as any)[enumKey];
    // Never silently skip the omission (that would leak e.g. passwordHash).
    if (!scalarFields) {
      throw new Error(`Cannot build omit-select for model ${this.model}: ${enumKey} not found`);
    }
    const select: Record<string, boolean> = {};
    for (const field of Object.values<string>(scalarFields)) {
      select[field] = !omit.includes(field);
    }
    return select;
  }

  /** Tenant-scoped delegate (auto tenantId filtering). */
  protected get delegate(): any {
    return (this.prisma.client as any)[this.model];
  }

  /** Unscoped delegate for platform-level writes (explicit tenantId required). */
  protected get rawDelegate(): any {
    return (this.prisma.raw as any)[this.model];
  }

  protected get ctx() {
    return getRequestContext();
  }

  protected activeWhere(where: Record<string, unknown> = {}): Record<string, unknown> {
    return { ...where, isDeleted: false };
  }

  async list(dto: ListQueryDto, opts: ListOptions = {}): Promise<{ items: any[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    const args = buildListArgs(dto, {
      ...opts,
      // Schema-derived sort whitelist: a sortBy that is not a column of this
      // model is rejected (400) instead of reaching Prisma and throwing a
      // validation error (500).
      model: this.model,
      where: { ...this.activeWhere(), ...(opts.where ?? {}) },
    });
    const select = this.omitSelect();
    const [items, total] = await Promise.all([
      this.delegate.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        ...(select ? { select } : {}),
      }),
      this.delegate.count({ where: args.where }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }

  async getById(id: string, include?: Record<string, unknown>): Promise<any> {
    const select = this.omitSelect();
    // When omitting sensitive columns, relations merge into the select object
    // (select and include are mutually exclusive in Prisma).
    const args = select
      ? { select: { ...select, ...(include ?? {}) } }
      : include
        ? { include }
        : {};
    return this.delegate.findUnique({
      where: this.activeWhere({ id }),
      ...args,
    });
  }

  async create(data: any, extra: Record<string, unknown> = {}): Promise<any> {
    return this.delegate.create({
      data: {
        ...data,
        ...extra,
        createdBy: this.ctx?.userId ?? null,
        updatedBy: this.ctx?.userId ?? null,
      },
    });
  }

  async update(id: string, data: any, extra: Record<string, unknown> = {}): Promise<any> {
    return this.delegate.update({
      where: this.activeWhere({ id }),
      data: {
        ...data,
        ...extra,
        updatedBy: this.ctx?.userId ?? null,
        version: versionBump.version,
      },
    });
  }

  /** Soft delete. */
  async archive(id: string): Promise<any> {
    return this.delegate.update({
      where: this.activeWhere({ id }),
      data: {
        isDeleted: true,
        deletedBy: this.ctx?.userId ?? null,
        deletedOn: new Date(),
        version: versionBump.version,
      },
    });
  }
}
