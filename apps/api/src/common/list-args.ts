import { ListQueryDto } from './pagination.dto';

export interface ListOptions {
  /** Fields scanned by the free-text search (case-insensitive contains). */
  searchFields?: string[];
  defaultSortBy?: string;
  defaultSortOrder?: 'asc' | 'desc';
  /** Extra fixed filters merged into `where` (e.g. isDeleted: false). */
  where?: Record<string, unknown>;
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

  const sortBy = dto.sortBy ?? opts.defaultSortBy ?? 'createdOn';
  const sortOrder = dto.sortOrder ?? opts.defaultSortOrder ?? 'desc';
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
