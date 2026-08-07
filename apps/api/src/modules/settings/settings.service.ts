import { BadRequestException, Injectable } from '@nestjs/common';
import { getRequestContext } from '@fabriq/database';
import { SettingScope } from '@fabriq/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Key-value configuration. Tenant settings are upserted by key and exposed
 * grouped: { general: { timezone: "..." }, production: { ... } }.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getGrouped() {
    const ctx = getRequestContext();
    const tenantId = ctx?.tenantId ?? null;
    const rows = await this.prisma.raw.setting.findMany({
      where: { tenantId, isDeleted: false },
      orderBy: { key: 'asc' },
    });
    const grouped: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      const group = row.group ?? 'general';
      grouped[group] = grouped[group] ?? {};
      grouped[group][row.key] = row.value;
    }
    return grouped;
  }

  async updateValues(values: Record<string, unknown>) {
    const ctx = getRequestContext();
    const tenantId = ctx?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Settings require a tenant context');
    }
    for (const [key, value] of Object.entries(values)) {
      const group = key.split('.')[0];
      await this.prisma.raw.setting.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: {
          tenantId,
          key,
          value: JSON.parse(JSON.stringify(value)),
          scope: SettingScope.TENANT,
          group,
          createdBy: ctx.userId,
        },
        update: {
          value: JSON.parse(JSON.stringify(value)),
          group,
          updatedBy: ctx.userId,
          version: { increment: 1 },
        },
      });
    }
    return this.getGrouped();
  }
}
