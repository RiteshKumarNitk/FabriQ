import { Injectable } from '@nestjs/common';
import { getRequestContext } from '@fabriq/database';
import { PrismaService } from '../../prisma/prisma.service';
import { ListQueryDto } from '../../common/pagination.dto';
import { buildListArgs, buildPaginationMeta } from '../../common/list-args';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dto: ListQueryDto & { module?: string; entityType?: string; entityId?: string; action?: string; userId?: string }) {
    const ctx = getRequestContext();
    const where: Record<string, unknown> = {};
    if (ctx?.tenantId) where['tenantId'] = ctx.tenantId;
    if (dto.module) where['module'] = dto.module;
    if (dto.entityType) where['entityType'] = dto.entityType;
    if (dto.entityId) where['entityId'] = dto.entityId;
    if (dto.action) where['action'] = dto.action;
    if (dto.userId) where['userId'] = dto.userId;

    const args = buildListArgs(dto, {
      model: 'AuditLog',
      where,
      defaultSortBy: 'createdOn',
      defaultSortOrder: 'desc',
    });

    const [items, total] = await Promise.all([
      this.prisma.raw.auditLog.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.raw.auditLog.count({ where: args.where }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }
}
