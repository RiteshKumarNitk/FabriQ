import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getRequestContext } from '@fabriq/database';
import { NotificationType } from '@fabriq/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ListQueryDto } from '../../common/pagination.dto';
import { buildListArgs, buildPaginationMeta } from '../../common/list-args';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** List the current user's notifications (optionally filtered by read state). */
  async listMine(dto: ListQueryDto, isRead?: boolean) {
    const ctx = getRequestContext();
    if (!ctx) throw new BadRequestException('Requires authentication');
    const where: Record<string, unknown> = { userId: ctx.userId };
    if (isRead !== undefined) where['isRead'] = isRead;
    const args = buildListArgs(dto, { model: 'Notification', where, defaultSortBy: 'createdOn', defaultSortOrder: 'desc' });
    const [items, total] = await Promise.all([
      this.prisma.raw.notification.findMany({ where: args.where, orderBy: args.orderBy, skip: args.skip, take: args.take }),
      this.prisma.raw.notification.count({ where: args.where }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }

  async unreadCount() {
    const ctx = getRequestContext();
    if (!ctx) throw new BadRequestException('Requires authentication');
    const count = await this.prisma.raw.notification.count({
      where: { userId: ctx.userId, isRead: false },
    });
    return { count };
  }

  async markRead(id: string) {
    const ctx = getRequestContext();
    const notification = await this.prisma.raw.notification.findFirst({
      where: { id, userId: ctx?.userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    return this.prisma.raw.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead() {
    const ctx = getRequestContext();
    if (!ctx) throw new BadRequestException('Requires authentication');
    const result = await this.prisma.raw.notification.updateMany({
      where: { userId: ctx.userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  /** Internal: create notifications for one or more recipients. */
  async send(data: {
    userId: string;
    tenantId?: string | null;
    type?: NotificationType;
    title: string;
    body?: string;
    link?: string;
  }) {
    return this.prisma.raw.notification.create({
      data: {
        userId: data.userId,
        tenantId: data.tenantId ?? null,
        type: data.type ?? NotificationType.SYSTEM,
        title: data.title,
        body: data.body,
        link: data.link,
      },
    });
  }
}
