import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@fabriq/database';
import { ListQueryDto } from './pagination.dto';

export interface ListOptions {
  /** Fields scanned by the free-text search (case-insensitive contains). */
  searchFields?: string[];
  defaultSortBy?: string;
  defaultSortOrder?: 'asc' | 'desc';
  /**
   * Columns the client may sort by. When omitted, the whitelist is derived
   * from the Prisma model's own scalar/enum fields (see `model`) — so a
   * column that does not exist can never reach Prisma.
   */
  sortByWhitelist?: readonly string[];
  /**
   * Prisma model name used to derive the sort whitelist from the schema.
   * The generic CRUD services set this automatically.
   */
  model?: string;
  /** Extra fixed filters merged into `where` (e.g. isDeleted: false). */
  where?: Record<string, unknown>;
}

/**
 * Whitelist cache per model: scalar + enum fields only. Everything else —
 * to-one relations (Prisma throws on bare relation orderBy), to-many
 * relations, list scalars and unknown names — must be rejected here, since
 * reaching Prisma would surface as a 500.
 */
const modelSortableFields = new Map<string, Set<string>>();

function sortableFieldsOf(model: string): Set<string> | null {
  let fields = modelSortableFields.get(model);
  if (fields) return fields;
  const def = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
  if (!def) return null;
  fields = new Set(
    def.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => f.name),
  );
  modelSortableFields.set(model, fields);
  return fields;
}

/**
 * Resolves the requested sort column against a whitelist.
 *
 *   • explicit `whitelist`  → non-member = 400 (caller knows the schema best)
 *   • known Prisma `model`  → non-scalar/enum column = 400 (schema-derived)
 *   • neither               → fall back to the default column (direct
 *     buildListArgs callers that predate whitelists must not regress from a
 *     500 to a 400; sorting is convenience, filtering is intent)
 *
 * The fallback itself is always trusted — services control it, not clients.
 */
function resolveSortColumn(
  sortBy: string,
  fallback: string,
  opts: { whitelist?: readonly string[]; model?: string },
): string {
  if (sortBy === fallback) return fallback;
  if (opts.whitelist) {
    if (opts.whitelist.includes(sortBy)) return sortBy;
    throw new BadRequestException(`Cannot sort by "${sortBy}"`);
  }
  const fields = opts.model ? sortableFieldsOf(opts.model) : undefined;
  if (fields) {
    if (fields.has(sortBy)) return sortBy;
    throw new BadRequestException(`Cannot sort by "${sortBy}"`);
  }
  return fallback;
}

/**
 * Converts a validated ListQueryDto into Prisma findMany/count arguments,
 * merging search (OR/contains across searchFields), JSON filters, sort
 * whitelist and base where clauses.
 */
export function buildListArgs(dto: ListQueryDto, opts: ListOptions = {}) {
  const page = dto.page ?? 1;
  const pageSize = dto.pageSize ?? 20;
  const where: Record<string, unknown> = { ...(opts.where ?? {}) };

  let parsedFilters: Record<string, string> = {};
  if (dto.filters) {
    try {
      parsedFilters = JSON.parse(dto.filters) as Record<string, string>;
    } catch {
      parsedFilters = {};
    }
  }
  for (const [key, value] of Object.entries(parsedFilters)) {
    if (value !== undefined && value !== null && value !== '') {
      where[key] = value;
    }
  }

  if (dto.search && opts.searchFields && opts.searchFields.length > 0) {
    where['OR'] = opts.searchFields.map((field) => ({
      [field]: { contains: dto.search, mode: 'insensitive' },
    }));
  }

  const fallback = opts.defaultSortBy ?? 'createdOn';
  const sortOrder = dto.sortOrder ?? opts.defaultSortOrder ?? 'desc';
  // Empty/whitespace sortBy is treated as omitted (UIs may send `sortBy=`).
  const requested = dto.sortBy && dto.sortBy.trim() !== '' ? dto.sortBy.trim() : fallback;
  const sortBy = resolveSortColumn(requested, fallback, {
    whitelist: opts.sortByWhitelist,
    model: opts.model,
  });
  const orderBy = [{ [sortBy]: sortOrder }];

  return {
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    page,
    pageSize,
  };
}

export function buildPaginationMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}
