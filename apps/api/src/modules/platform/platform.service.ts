import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, TenantStatus } from '@fabriq/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Platform-scope aggregate service (used exclusively by platform admins).
 * Reads across ALL tenants via the raw client — never the tenant-scoped client.
 */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const [tenants, companyCount, factoryCount, warehouseCount, userCount, activeSessions, dbOk, recentAudit, loginsToday] =
      await Promise.all([
        this.prisma.raw.tenant.findMany({ where: { isDeleted: false }, select: { id: true, status: true, plan: true, createdOn: true } }),
        this.prisma.raw.company.count({ where: { isDeleted: false } }),
        this.prisma.raw.factory.count({ where: { isDeleted: false } }),
        this.prisma.raw.warehouse.count({ where: { isDeleted: false } }),
        this.prisma.raw.user.count({ where: { isDeleted: false } }),
        this.prisma.raw.refreshToken.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
        this.pingDatabase(),
        this.prisma.raw.auditLog.findMany({
          where: {},
          orderBy: { createdOn: 'desc' },
          take: 8,
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        }),
        this.prisma.raw.auditLog.count({
          where: { action: AuditAction.LOGIN, createdOn: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        }),
      ]);

    const tenantTotals = tenants.length;
    const byStatus: Record<string, number> = {};
    const byPlan: Record<string, number> = {};
    for (const t of tenants) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      byPlan[t.plan ?? 'free'] = (byPlan[t.plan ?? 'free'] ?? 0) + 1;
    }

    return {
      tenants: {
        total: tenantTotals,
        active: byStatus[TenantStatus.ACTIVE] ?? 0,
        suspended: byStatus[TenantStatus.SUSPENDED] ?? 0,
        onboarding: byStatus[TenantStatus.ONBOARDING] ?? 0,
        closed: byStatus[TenantStatus.CLOSED] ?? 0,
        trial: byPlan['trial'] ?? 0,
        expired: 0, // placeholder — subscription expiry model arrives with the billing module
        byPlan,
      },
      resources: {
        companies: companyCount,
        factories: factoryCount,
        warehouses: warehouseCount,
        users: userCount,
        activeSessions,
      },
      subscriptions: {
        activePlans: Object.entries(byPlan).map(([plan, count]) => ({ plan, count })),
        trialPlans: byPlan['trial'] ?? 0,
        expiring: 0, // placeholder
        revenue: null, // placeholder — never fabricate financials; null = not available
        licenses: { used: userCount, total: userCount * 5, seatsPerTenant: 5 }, // placeholder model
        storageGb: null, // placeholder
      },
      health: {
        api: 'ok',
        database: dbOk ? 'ok' : 'degraded',
        queue: 'not-configured', // future module
        fileStorage: 'not-configured', // future module
        version: process.env.npm_package_version ?? '0.1.0',
        uptimeSeconds: Math.round(process.uptime()),
        lastBackup: null, // placeholder
      },
      activity: {
        recent: recentAudit,
        loginsToday: loginsToday,
        failedLogins: 0, // placeholder — failed logins are not yet audited
        auditEvents: await this.prisma.raw.auditLog.count({}),
      },
      charts: {
        tenantGrowth: await this.growthSeries('tenant', tenants.map((t) => t.createdOn)),
        userGrowth: await this.growthSeries('user'),
        companyGrowth: await this.growthSeries('company'),
        loginsPerDay: await this.loginSeries(),
      },
    };
  }

  /** Last 6 months, oldest → newest, zero-filled. */
  private async growthSeries(
    kind: 'tenant' | 'user' | 'company',
    preloaded?: Date[],
  ): Promise<Array<{ month: string; count: number }>> {
    const months = this.lastMonths(6);
    const since = months[0].start;
    let rows: Array<{ createdOn: Date | string }> = [];
    if (preloaded) {
      rows = preloaded.map((createdOn) => ({ createdOn }));
    } else if (kind === 'user') {
      rows = await this.prisma.raw.user.findMany({
        where: { isDeleted: false, createdOn: { gte: since } },
        select: { createdOn: true },
      });
    } else {
      rows = await this.prisma.raw.company.findMany({
        where: { isDeleted: false, createdOn: { gte: since } },
        select: { createdOn: true },
      });
    }
    const counts = new Array(months.length).fill(0);
    for (const row of rows) {
      const d = new Date(row.createdOn);
      const idx = months.findIndex((m) => d >= m.start && d < m.end);
      if (idx >= 0) counts[idx] += 1;
    }
    return months.map((m, i) => ({ month: m.label, count: counts[i] }));
  }

  /** Daily LOGIN audit events, last 7 days, oldest → newest. */
  private async loginSeries(): Promise<Array<{ day: string; count: number }>> {
    const days: Array<{ label: string; start: Date; end: Date }> = [];
    for (let i = 6; i >= 0; i--) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      days.push({ label: start.toLocaleDateString('en', { weekday: 'short' }), start, end });
    }
    const rows = await this.prisma.raw.auditLog.findMany({
      where: { action: AuditAction.LOGIN, createdOn: { gte: days[0].start } },
      select: { createdOn: true },
    });
    const counts = new Array(days.length).fill(0);
    for (const row of rows) {
      const d = new Date(row.createdOn);
      const idx = days.findIndex((day) => d >= day.start && d < day.end);
      if (idx >= 0) counts[idx] += 1;
    }
    return days.map((day, i) => ({ day: day.label, count: counts[i] }));
  }

  private lastMonths(n: number) {
    const months: Array<{ label: string; start: Date; end: Date }> = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      months.push({ label: start.toLocaleDateString('en', { month: 'short' }), start, end });
    }
    return months;
  }

  private async pingDatabase(): Promise<boolean> {
    try {
      await this.prisma.raw.$queryRaw`SELECT 1`;
      return true;
    } catch (e) {
      this.logger.error('Database ping failed', e instanceof Error ? e.stack : String(e));
      return false;
    }
  }
}
