import { BadRequestException, Injectable } from '@nestjs/common';
import { permissionExists } from '@fabriq/shared';
import { CrudService } from '../../common/crud.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@Injectable()
export class RolesService extends CrudService {
  protected readonly model = 'Role';

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override list(dto: any) {
    return super.list(dto, {
      searchFields: ['code', 'name'],
      defaultSortBy: 'createdOn',
    });
  }

  override async getById(id: string) {
    const role = await super.getById(id, {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    });
    if (role) {
      role.permissionCodes = role.permissions.map((p: any) => p.permission.code);
      role.userCount = role._count?.users ?? 0;
      delete role._count;
      delete role.permissions;
    }
    return role;
  }

  async create(dto: CreateRoleDto) {
    const { permissionCodes, ...rest } = dto;
    await this.validatePermissionCodes(permissionCodes);
    return this.prisma.raw.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          ...rest,
          tenantId: this.ctx?.tenantId ?? null,
          createdBy: this.ctx?.userId ?? null,
          updatedBy: this.ctx?.userId ?? null,
        },
      });
      if (permissionCodes?.length) {
        await this.linkPermissions(tx, role.id, permissionCodes);
      }
      return role;
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    const { permissionCodes, ...rest } = dto;
    const updated = await super.update(id, { ...rest });
    if (permissionCodes) {
      await this.validatePermissionCodes(permissionCodes);
      await this.prisma.raw.$transaction(async (tx) => {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await this.linkPermissions(tx, id, permissionCodes);
      });
    }
    return updated;
  }

  async setPermissions(id: string, permissionCodes: string[]) {
    await this.validatePermissionCodes(permissionCodes);
    await this.prisma.raw.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await this.linkPermissions(tx, id, permissionCodes);
    });
    return this.getById(id);
  }

  private async validatePermissionCodes(codes?: string[]) {
    if (!codes) return;
    const invalid = codes.filter((c) => !permissionExists(c));
    if (invalid.length > 0) {
      throw new BadRequestException(`Unknown permission codes: ${invalid.join(', ')}`);
    }
    // Platform-scope permissions may only be granted by platform admins — a
    // tenant admin must never be able to build an escalation role.
    if (!this.ctx?.isPlatformAdmin) {
      const platformCodes = codes.filter((c) => c.startsWith('platform:'));
      if (platformCodes.length > 0) {
        throw new BadRequestException(
          `Platform-level permissions cannot be assigned to tenant roles: ${platformCodes.join(', ')}`,
        );
      }
    }
  }

  private async linkPermissions(tx: any, roleId: string, permissionCodes: string[]) {
    const perms = await tx.permission.findMany({ where: { code: { in: permissionCodes } } });
    await tx.rolePermission.createMany({
      data: perms.map((p: any) => ({ roleId, permissionId: p.id })),
    });
  }
}
