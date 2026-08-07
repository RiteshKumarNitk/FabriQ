import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getRequestContext } from '@fabriq/database';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCommentDto } from './dto/comment.dto';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(entityType: string, entityId: string) {
    const ctx = getRequestContext();
    const where: Record<string, unknown> = { entityType, entityId };
    if (ctx?.tenantId) where['tenantId'] = ctx.tenantId;
    return this.prisma.raw.comment.findMany({
      where,
      orderBy: { createdOn: 'asc' },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
  }

  async create(dto: CreateCommentDto) {
    const ctx = getRequestContext();
    if (!ctx) throw new BadRequestException('Requires authentication');
    return this.prisma.raw.comment.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        body: dto.body,
        parentId: dto.parentId,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
  }

  async remove(id: string) {
    const ctx = getRequestContext();
    const comment = await this.prisma.raw.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');
    const isAdmin = ctx?.isPlatformAdmin || ctx?.permissions.includes('comment:manage');
    if (!isAdmin && comment.userId !== ctx?.userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }
    await this.prisma.raw.comment.delete({ where: { id } });
    return { success: true, id };
  }
}
