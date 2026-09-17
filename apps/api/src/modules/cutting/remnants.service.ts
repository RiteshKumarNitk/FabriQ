import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RemnantStatus } from '@fabriq/shared';
import { getRequestContext } from '@fabriq/database';
import { PrismaService } from '../../prisma/prisma.service';
import { parseListFilters, resolveListSort } from '../../common/list-filters';

/** Columns the remnants list endpoint accepts as filters / sort keys (whitelisted). */
const REMNANT_FILTER_FIELDS = ['status', 'fabricName', 'fabricType', 'color', 'shadeLot'] as const;
const REMNANT_SORTABLE_FIELDS = [
  'number',
  'fabricName',
  'fabricType',
  'color',
  'shadeLot',
  'lengthCm',
  'widthCm',
  'usableWidthCm',
  'status',
  'location',
  'createdOn',
] as const;

/**
 * Remnant inventory: physically separated usable leftovers created only by
 * the roll close-out workflow (FabricRollsService.closeRoll). Distinct from
 * remaining roll fabric and from waste — the ledger keeps the history, this
 * module is the searchable stock of remnants.
 */
@Injectable()
export class RemnantsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    search?: string;
    status?: string;
    filters?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const filters = parseListFilters(query.filters, REMNANT_FILTER_FIELDS);
    const where: Record<string, unknown> = { isDeleted: false, ...filters };
    if (query.status) where['status'] = query.status;
    if (query.search) {
      where['OR'] = ['number', 'fabricName', 'fabricType', 'color', 'shadeLot', 'location'].map((f) => ({
        [f]: { contains: query.search, mode: 'insensitive' },
      }));
    }
    const { orderBy } = resolveListSort(query.sortBy, query.sortOrder, {
      sortableFields: REMNANT_SORTABLE_FIELDS,
      defaultSortBy: 'createdOn',
      defaultSortOrder: 'desc',
    });
    const [items, total] = await Promise.all([
      this.prisma.client.remnant.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { sourceRoll: { select: { id: true, number: true } } },
      }),
      this.prisma.client.remnant.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async getById(id: string) {
    const remnant = await this.prisma.client.remnant.findFirst({
      where: { id, isDeleted: false },
      include: {
        sourceRoll: {
          select: { id: true, number: true, fabricName: true, color: true, status: true },
        },
      },
    });
    if (!remnant) throw new NotFoundException('Remnant not found');
    return remnant;
  }

  async update(id: string, dto: { status?: string; location?: string; notes?: string }) {
    await this.getById(id);
    if (dto.status != null && !Object.values(RemnantStatus).includes(dto.status as RemnantStatus)) {
      throw new BadRequestException(`Invalid remnant status: ${dto.status}`);
    }
    return this.prisma.client.remnant.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status as RemnantStatus } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        updatedBy: getRequestContext()?.userId ?? null,
        version: { increment: 1 },
      },
    });
  }

  async archive(id: string) {
    await this.getById(id);
    return this.prisma.raw.remnant.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedOn: new Date(),
        deletedBy: getRequestContext()?.userId ?? null,
      },
    });
  }
}
