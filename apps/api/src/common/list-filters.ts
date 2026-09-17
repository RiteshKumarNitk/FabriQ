import { BadRequestException } from '@nestjs/common';

/**
 * Shared list-query helpers for the hand-written cutting-room list endpoints
 * (fabric-rolls, markers, cut-orders). The generic admin CRUD endpoints use
 * `buildListArgs` (common/list-args.ts); these endpoints have custom queries,
 * so they must parse the same wire convention themselves:
 *
 *   filters={"status":"ACTIVE"}   JSON object of { field: value }
 *   sortBy=number&sortOrder=desc  whitelist-checked sort
 */

/** Keys that must never be injected via the filters JSON. */
const RESERVED_FILTER_KEYS = new Set([
  'id',
  'tenantId',
  'isDeleted',
  'deletedOn',
  'deletedBy',
  'createdBy',
  'updatedBy',
  'AND',
  'OR',
  'NOT',
]);

/**
 * Parses the `filters` JSON object from a list request. Unknown keys are
 * rejected (they would produce a Prisma validation error → 500), reserved
 * audit/system keys are ignored, and only scalar values pass through.
 */
export function parseListFilters(
  raw?: string,
  allowedFields?: readonly string[],
): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException('filters must be a valid JSON object, e.g. {"status":"ACTIVE"}');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestException('filters must be a JSON object of { field: value }');
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    if (RESERVED_FILTER_KEYS.has(key)) continue;
    if (allowedFields && !allowedFields.includes(key)) {
      throw new BadRequestException(`Cannot filter by "${key}"`);
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new BadRequestException(`Filter value for "${key}" must be a scalar`);
    }
    out[key] = String(value);
  }
  return out;
}

/**
 * Resolves sortBy/sortOrder against a whitelist. Falls back to the provided
 * default column when the request omits sortBy (or sends a non-whitelisted
 * column instead of erroring — sorting is convenience, filtering is intent).
 */
export function resolveListSort(
  sortBy?: string,
  sortOrder?: string,
  opts: {
    sortableFields: readonly string[];
    defaultSortBy: string;
    defaultSortOrder?: 'asc' | 'desc';
  } = {
    sortableFields: [],
    defaultSortBy: 'createdOn',
  },
): { orderBy: Record<string, 'asc' | 'desc'>; sortBy: string; sortOrder: 'asc' | 'desc' } {
  const sortOrderValue: 'asc' | 'desc' =
    sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : (opts.defaultSortOrder ?? 'desc');
  const column =
    sortBy && opts.sortableFields.includes(sortBy) ? sortBy : opts.defaultSortBy;
  return { orderBy: { [column]: sortOrderValue }, sortBy: column, sortOrder: sortOrderValue };
}
