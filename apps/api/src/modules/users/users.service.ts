import { BadRequestException, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { UserStatus } from '@fabriq/shared';
import { CrudService } from '../../common/crud.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService extends CrudService {
  protected readonly model = 'User';

  /** Password hashes must never leave the API. */
  protected override get omitFields(): string[] {
    return ['passwordHash'];
  }

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override list(dto: any) {
    return super.list(dto, {
      searchFields: ['firstName', 'lastName', 'email'],
      defaultSortBy: 'createdOn',
    });
  }

  override getById(id: string) {
    return super.getById(id, {
      roles: { include: { role: true } },
      company: true,
      factory: true,
    });
  }

  async create(dto: CreateUserDto) {
    const { password, roleIds, tenantId, ...rest } = dto;
    const passwordHash = await bcrypt.hash(password, 12);
    const data = { ...rest, passwordHash, status: dto.status ?? UserStatus.ACTIVE };

    let user: any;
    if (this.ctx?.tenantId) {
      user = await this.delegate.create({ data });
    } else {
      if (!tenantId) {
        throw new BadRequestException('tenantId is required when creating a user at platform level');
      }
      user = await this.rawDelegate.create({ data: { ...data, tenantId } });
    }
    await this.assignRoles(user.id, user.tenantId, roleIds);
    return this.getById(user.id);
  }

  async update(id: string, dto: UpdateUserDto) {
    const { password: _ignored, roleIds, tenantId: _tid, ...rest } = dto;
    void _ignored;
    void _tid;
    const updated = await super.update(id, { ...rest });
    if (roleIds) {
      await this.replaceRoles(id, updated.tenantId, roleIds);
    }
    return this.getById(id);
  }

  async resetPassword(id: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    return this.delegate.update({
      where: { id, isDeleted: false },
      data: { passwordHash, mustChangePassword: false, updatedBy: this.ctx?.userId ?? null, version: { increment: 1 } },
    });
  }

  // ── role assignment ─────────────────────────────────────────────────────

  private async assignRoles(userId: string, tenantId: string | null, roleIds?: string[]) {
    if (!roleIds?.length) return;
    const roles = await this.rolesInScope(roleIds, tenantId);
    await this.prisma.raw.userRole.createMany({
      data: roles.map((r) => ({ userId, roleId: r.id })),
    });
  }

  private async replaceRoles(userId: string, tenantId: string | null, roleIds: string[]) {
    const roles = await this.rolesInScope(roleIds, tenantId);
    const allowedIds = new Set(roles.map((r) => r.id));
    await this.prisma.raw.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: Array.from(allowedIds).map((roleId) => ({ userId, roleId })),
      });
    });
  }

  private async rolesInScope(roleIds: string[], tenantId: string | null) {
    const roles = await this.prisma.raw.role.findMany({
      where: { id: { in: roleIds }, tenantId, isDeleted: false },
    });
    if (roles.length !== roleIds.length) {
      throw new BadRequestException('One or more roles do not exist in this tenant');
    }
    return roles;
  }
}
