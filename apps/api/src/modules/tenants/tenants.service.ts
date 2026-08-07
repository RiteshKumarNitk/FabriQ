import { Injectable } from '@nestjs/common';
import { provisionTenant } from '@fabriq/database';
import { CrudService } from '../../common/crud.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';

/**
 * Tenants are platform-level entities. They are managed through the raw
 * (unscoped) Prisma client; creating a tenant transactionally provisions its
 * system roles and default settings.
 */
@Injectable()
export class TenantsService extends CrudService {
  protected readonly model = 'Tenant';

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override async create(dto: CreateTenantDto) {
    // Provisioning creates ~350 role/permission rows — needs a longer
    // interactive transaction window than Prisma's 5s default, especially
    // against remote databases (Neon).
    return this.prisma.raw.$transaction(
      async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            ...dto,
            createdBy: this.ctx?.userId ?? null,
            updatedBy: this.ctx?.userId ?? null,
          },
        });
        await provisionTenant(tx as any, tenant.id);
        return tenant;
      },
      { timeout: 60_000 },
    );
  }

  async update(id: string, dto: UpdateTenantDto) {
    return this.rawDelegate.update({
      where: { id, isDeleted: false },
      data: { ...dto, updatedBy: this.ctx?.userId ?? null, version: { increment: 1 } },
    });
  }

  async archive(id: string) {
    return this.rawDelegate.update({
      where: { id, isDeleted: false },
      data: { isDeleted: true, deletedBy: this.ctx?.userId ?? null, deletedOn: new Date() },
    });
  }

  async getStats(id: string) {
    const [companies, factories, warehouses, users] = await Promise.all([
      this.prisma.raw.company.count({ where: { tenantId: id, isDeleted: false } }),
      this.prisma.raw.factory.count({ where: { tenantId: id, isDeleted: false } }),
      this.prisma.raw.warehouse.count({ where: { tenantId: id, isDeleted: false } }),
      this.prisma.raw.user.count({ where: { tenantId: id, isDeleted: false } }),
    ]);
    return { companies, factories, warehouses, users };
  }
}
