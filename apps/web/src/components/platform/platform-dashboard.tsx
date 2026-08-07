'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Building2,
  FileText,
  HardDrive,
  HeartPulse,
  KeyRound,
  Layers,
  Lock,
  Server,
  Settings2,
  ShoppingBag,
  Timer,
  Truck,
  UserPlus,
  Users,
  Warehouse,
  Workflow,
  Zap,
} from 'lucide-react';
import { http } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { formatDateTime, titleCase } from '@/lib/utils';

interface GrowthPoint {
  month: string;
  count: number;
}
interface LoginPoint {
  day: string;
  count: number;
}

interface PlatformSummary {
  tenants: {
    total: number;
    active: number;
    suspended: number;
    onboarding: number;
    closed: number;
    trial: number;
    expired: number;
    byPlan: Record<string, number>;
  };
  resources: { companies: number; factories: number; warehouses: number; users: number; activeSessions: number };
  subscriptions: {
    activePlans: Array<{ plan: string; count: number }>;
    trialPlans: number;
    expiring: number;
    revenue: number | null;
    licenses: { used: number; total: number };
    storageGb: number | null;
  };
  health: {
    api: string;
    database: string;
    queue: string;
    fileStorage: string;
    version: string;
    uptimeSeconds: number;
    lastBackup: string | null;
  };
  activity: {
    recent: Array<{ id: string; action: string; module: string; entityType: string; createdOn: string; user?: { firstName: string; lastName: string; email: string } }>;
    loginsToday: number;
    failedLogins: number;
    auditEvents: number;
  };
  charts: { tenantGrowth: GrowthPoint[]; userGrowth: GrowthPoint[]; companyGrowth: GrowthPoint[]; loginsPerDay: LoginPoint[] };
}

function StatCard({ icon: Icon, label, value, sub, href }: { icon: React.ElementType; label: string; value: React.ReactNode; sub?: string; href?: string }) {
  const body = (
    <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-3 text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground/70">{sub}</div> : null}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="group block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

function Bars({ data, colorClass = 'bg-primary/80 group-hover:bg-primary' }: { data: GrowthPoint[] | LoginPoint[]; colorClass?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const label = (d: GrowthPoint | LoginPoint) => ('month' in d ? d.month : d.day);
  return (
    <div className="flex h-32 items-end gap-2">
      {data.map((d) => {
        const h = d.count === 0 ? 4 : Math.max(10, Math.round((d.count / max) * 100));
        return (
          <div key={label(d)} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-medium text-muted-foreground">{d.count}</span>
            <div className={`w-full rounded-t-md transition-colors ${colorClass}`} style={{ height: `${h}%` }} title={`${label(d)}: ${d.count}`} />
            <span className="text-[10px] text-muted-foreground">{label(d)}</span>
          </div>
        );
      })}
    </div>
  );
}

function HealthPill({ label, state }: { label: string; state: string }) {
  const variant =
    state === 'ok'
      ? 'bg-emerald-500/10 text-emerald-600'
      : state === 'degraded'
        ? 'bg-amber-500/10 text-amber-600'
        : 'bg-muted text-muted-foreground';
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${variant}`}>
        {state === 'not-configured' ? '—' : state === 'ok' ? 'OK' : titleCase(state)}
      </span>
    </div>
  );
}

const QUICK_ACTIONS = [
  { label: 'Create Tenant', href: '/admin/tenants', icon: UserPlus, desc: 'Provision a new tenant workspace' },
  { label: 'View Tenants', href: '/admin/tenants', icon: Layers, desc: 'Tenant list, status and plans' },
  { label: 'Audit Logs', href: '/audit', icon: FileText, desc: 'Platform-wide activity' },
  { label: 'Subscription Plans', href: '/platform/subscriptions', icon: ShoppingBag, desc: 'Plan catalog (coming soon)' },
  { label: 'Platform Settings', href: '/platform/settings', icon: Settings2, desc: 'Global configuration (coming soon)' },
];

export function PlatformDashboard() {
  const [data, setData] = useState<PlatformSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    http
      .get<PlatformSummary>('/platform/summary')
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  const s = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Platform Overview</h2>
          <p className="text-sm text-muted-foreground">
            The entire SaaS platform across all tenants{data ? ` · v${data.health.version}` : ''}.
          </p>
        </div>
        {data ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1">
              <Timer className="h-3 w-3" /> Up {Math.floor(data.health.uptimeSeconds / 60)}m
            </Badge>
            <Badge variant="outline" className="gap-1">
              <HeartPulse className="h-3 w-3 text-emerald-500" /> API {data.health.api.toUpperCase()}
            </Badge>
          </div>
        ) : null}
      </div>

      {/* Platform overview */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Platform Overview</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {!s ? (
            Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
          ) : (
            <>
              <StatCard icon={Layers} label="Total Tenants" value={s.tenants.total} sub={`${s.tenants.active} active`} href="/admin/tenants" />
              <StatCard icon={Zap} label="Active Tenants" value={s.tenants.active} sub={`${s.tenants.onboarding} onboarding`} href="/admin/tenants" />
              <StatCard icon={Lock} label="Suspended" value={s.tenants.suspended} sub={`${s.tenants.closed} closed`} href="/admin/tenants" />
              <StatCard icon={ShoppingBag} label="Trial Tenants" value={s.tenants.trial} sub={`${s.tenants.expired} expired`} />
              <StatCard icon={Building2} label="Companies" value={s.resources.companies} href="/admin/companies" />
              <StatCard icon={Truck} label="Factories" value={s.resources.factories} href="/admin/factories" />
              <StatCard icon={Warehouse} label="Warehouses" value={s.resources.warehouses} href="/admin/warehouses" />
              <StatCard icon={Users} label="Users" value={s.resources.users} href="/admin/users" />
              <StatCard icon={KeyRound} label="Active Sessions" value={s.resources.activeSessions} />
              <StatCard icon={Activity} label="Audit Events" value={s.activity.auditEvents} sub={`${s.activity.loginsToday} logins today`} href="/audit" />
            </>
          )}
        </div>
      </div>

      {/* Subscription + health */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">Subscriptions</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {!s ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <div className="space-y-1.5">
                  {s.subscriptions.activePlans.map((p) => (
                    <div key={p.plan} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-muted-foreground">{titleCase(p.plan)} plan</span>
                      <span className="font-medium">{p.count} tenant{p.count === 1 ? '' : 's'}</span>
                    </div>
                  ))}
                  {s.subscriptions.activePlans.length === 0 ? <p className="text-sm text-muted-foreground">No active plans</p> : null}
                </div>
                <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Licenses used</div>
                    <div className="font-medium">{s.subscriptions.licenses.used} / {s.subscriptions.licenses.total}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Expiring soon</div>
                    <div className="font-medium">{s.subscriptions.expiring}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Revenue (YTD)</div>
                    <div className="font-medium text-muted-foreground">{s.subscriptions.revenue === null ? 'Not available' : `₹${s.subscriptions.revenue}`}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Storage used</div>
                    <div className="font-medium text-muted-foreground">{s.subscriptions.storageGb === null ? 'Not available' : `${s.subscriptions.storageGb} GB`}</div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">System Health</CardTitle>
            <HeartPulse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            {!s ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <HealthPill label="API" state={s.health.api} />
                  <HealthPill label="Database" state={s.health.database} />
                  <HealthPill label="Queue" state={s.health.queue} />
                  <HealthPill label="File Storage" state={s.health.fileStorage} />
                </div>
                <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Application version</div>
                    <div className="font-medium">v{s.health.version}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Last backup</div>
                    <div className="font-medium text-muted-foreground">{s.health.lastBackup ? formatDateTime(s.health.lastBackup) : 'Not configured'}</div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Growth — last 6 months</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!s ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Tenants</p>
                  <Bars data={s.charts.tenantGrowth} />
                </div>
                <div className="grid grid-cols-2 gap-4 border-t pt-3">
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Users</p>
                    <Bars data={s.charts.userGrowth} colorClass="bg-sky-500/70 group-hover:bg-sky-500" />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Companies</p>
                    <Bars data={s.charts.companyGrowth} colorClass="bg-violet-500/70 group-hover:bg-violet-500" />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Daily logins — last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            {!s ? <Skeleton className="h-40 w-full" /> : <Bars data={s.charts.loginsPerDay} colorClass="bg-emerald-500/70 group-hover:bg-emerald-500" />}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions + activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.label}
                  href={a.href}
                  className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{a.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.desc}</div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">Platform Activity</CardTitle>
            <Link href="/audit" className="text-xs text-primary hover:underline">View all →</Link>
          </CardHeader>
          <CardContent className="space-y-0 p-0">
            {!s ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="mx-4 my-2 h-9" />)
            ) : s.activity.recent.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">No platform activity yet</p>
            ) : (
              s.activity.recent.map((row) => (
                <div key={row.id} className="flex items-center gap-3 border-t px-6 py-2.5 first:border-t-0">
                  <Badge variant="outline" className="text-[10px]">{row.action}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <span className="font-medium">{row.user ? `${row.user.firstName} ${row.user.lastName}` : 'System'}</span>
                      <span className="text-muted-foreground"> · {titleCase(row.entityType)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(row.createdOn)}</p>
                  </div>
                  <Server className="h-3.5 w-3.5 text-muted-foreground/40" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <HardDrive className="h-3.5 w-3.5" />
        Placeholders (revenue, storage, backups, expiring subscriptions, failed logins) are marked “not available” until the billing & infrastructure modules land.
        <Workflow className="ml-2 h-3.5 w-3.5" />
        Charts use live data.
      </div>
    </div>
  );
}
