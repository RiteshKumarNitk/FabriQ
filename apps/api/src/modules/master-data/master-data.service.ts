import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CrudService } from '../../common/crud.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ListQueryDto } from '../../common/pagination.dto';
import { buildListArgs, buildPaginationMeta } from '../../common/list-args';

@Injectable()
export class MasterDataService extends CrudService {
  protected readonly model = 'MasterDataCategory';

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  // ── categories ──────────────────────────────────────────────────────────

  listCategories(dto: ListQueryDto) {
    return super.list(dto, {
      searchFields: ['code', 'name'],
      defaultSortBy: 'createdOn',
    });
  }

  async getCategory(id: string) {
    const category = await super.getById(id, {
      items: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
      _count: { select: { items: true } },
    });
    if (!category) throw new NotFoundException('Category not found');
    category.itemCount = category._count?.items ?? 0;
    delete category._count;
    return category;
  }

  createCategory(dto: any) {
    return super.create({ ...dto });
  }

  updateCategory(id: string, dto: any) {
    return super.update(id, { ...dto });
  }

  archiveCategory(id: string) {
    return super.archive(id);
  }

  // ── items ───────────────────────────────────────────────────────────────

  async listItems(categoryId: string, dto: ListQueryDto) {
    const cat = await super.getById(categoryId);
    if (!cat) throw new NotFoundException('Category not found');
    const args = buildListArgs(dto, {
      searchFields: ['code', 'name'],
      where: { isDeleted: false, categoryId },
      defaultSortBy: 'sortOrder',
      defaultSortOrder: 'asc',
    });
    const [items, total] = await Promise.all([
      this.prisma.client.masterDataItem.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.masterDataItem.count({ where: args.where }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }

  async createItem(categoryId: string, dto: any) {
    const cat = await super.getById(categoryId);
    if (!cat) throw new NotFoundException('Category not found');
    return this.prisma.client.masterDataItem.create({
      data: { ...dto, categoryId, createdBy: this.ctx?.userId ?? null, updatedBy: this.ctx?.userId ?? null },
    });
  }

  updateItem(id: string, dto: any) {
    return this.prisma.client.masterDataItem.update({
      where: { id, isDeleted: false },
      data: { ...dto, updatedBy: this.ctx?.userId ?? null, version: { increment: 1 } },
    });
  }

  archiveItem(id: string) {
    return this.prisma.client.masterDataItem.update({
      where: { id, isDeleted: false },
      data: { isDeleted: true, deletedBy: this.ctx?.userId ?? null, deletedOn: new Date() },
    });
  }

  /** Lightweight options for dropdowns: GET /master-data/options?category=FABRIC_TYPE */
  async options(categoryCode: string) {
    const tenantId = this.ctx?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Options require a tenant context');
    }
    const category = await this.prisma.client.masterDataCategory.findUnique({
      where: { tenantId_code: { tenantId, code: categoryCode } },
    });
    if (!category) {
      throw new BadRequestException(`Master data category '${categoryCode}' not found`);
    }
    const items = await this.prisma.client.masterDataItem.findMany({
      where: { categoryId: category.id, isDeleted: false, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true },
    });
    return items;
  }
}
