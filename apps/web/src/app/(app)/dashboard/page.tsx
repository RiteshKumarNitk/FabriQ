'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, ClipboardList, Factory, FileText, Package, ScanSearch, Truck, Users, Warehouse, Workflow } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, titleCase } from '@/lib/utils';
import { PlatformDashboard } from '@/components/platform/platform-dashboard';

interface Summary {
  counts: Record<string, number>;
  recentAudit: Array<{ id: string; action: string; module: string; entityType: string; createdOn: string; user?: { firstName: string; lastName: string } }>;
  recentNotifications: Array<{ id: string; title: string; type: string; isRead: boolean; createdOn: string }>;
}

interface KpiDef {
  key: string;
  label: string;
  href: string;
  icon: React.ElementType;
  perm: string;
}

const KPI_CARDS: KpiDef[] = [
  { key: 'companies', label: 'Companies', href: '/admin/companies', icon: Building2, perm: 'company:read' },
  { key: 'factories', label: 'Factories', href: '/admin/factories', icon: Factory, perm: 'factory:read' },
  { key: 'warehouses', label: 'Warehouses', href: '/admin/warehouses', icon: Warehouse, perm: 'warehouse:read' },
  { key: 'users', label: 'Users', href: '/admin/users', icon: Users, perm: 'user:read' },
  { key: 'lines', label: 'Production Lines', href: '/admin/lines', icon: Workflow, perm: 'orgunit:read' },
  { key: 'masterItems', label: 'Master Data Items', href: '/admin/master-items', icon: Package, perm: 'masterdata:read' },
];

const PROCUREMENT_CARDS: KpiDef[] = [
  { key: 'suppliers', label: 'Suppliers', href: '/admin/suppliers', icon: Truck, perm: 'supplier:read' },
  { key: 'openRequisitions', label: 'Open Requisitions', href: '/procurement/requisitions', icon: ClipboardList, perm: 'requisition:read' },
  { key: 'openPurchaseOrders', label: 'Open Purchase Orders', href: '/procurement/purchase-orders', icon: FileText, perm: 'purchaseorder:read' },
  { key: 'pendingInspections', label: 'Rolls Awaiting Inspection', href: '/procurement/inspections', icon: ScanSearch, perm: 'inspection:read' },
];

const ROLE_LABELS: Record<string, string> = {
  PLATFORM_ADMIN: 'Platform Administrator',
  TENANT_ADMIN: 'Company Administrator',
  FACTORY_MANAGER: 'Factory Manager',
  SUPERVISOR: 'Supervisor',
  OPERATOR: 'Operator',
  VIEWER: 'Viewer',
};

function roleLabel(roles: string[]): string {
  const role = roles[0];
  return ROLE_LABELS[role] ?? (role ? titleCase(role) : 'Member');
}

function KpiGrid({ cards, counts }: { cards: KpiDef[]; counts?: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((kpi) => {
        const Icon = kpi.icon;
        const value = counts?.[kpi.key];
        return (
          <Link key={kpi.key} href={kpi.href} className="group">
            <Card className="transition-all group-hover:border-primary/40 group-hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/0 transition-all group-hover:text-primary" />
                </div>
                <div className="mt-3 text-2xl font-semibold">
                  {value === undefined ? <Skeleton className="h-7 w-10" /> : value}
                </div>
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function TenantDashboard() {
  const { user, has } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    http
      .get<Summary>('/dashboard/summary')
      .then(setSummary)
      .catch((e) => setError((e as Error).message));
  }, []);

  const kpiCards = KPI_CARDS.filter((c) => has(c.perm));
  const procurementCards = PROCUREMENT_CARDS.filter((c) => has(c.perm));
  const canSeeAudit = has('audit:read');
  const firstName = user?.firstName ?? 'there';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Operations Overview</h2>
        <p className="text-sm text-muted-foreground">
          Welcome back, {firstName} — {roleLabel(user?.roles ?? [])} view of your tenant.
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {kpiCards.length > 0 ? (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Your Organization</h3>
          <KpiGrid cards={kpiCards} counts={summary?.counts} />
        </div>
      ) : null}

      {procurementCards.length > 0 ? (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Procurement</h3>
          <KpiGrid cards={procurementCards} counts={summary?.counts} />
        </div>
      ) : null}

      {has('workflow:read') ? (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Workflow className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Approval Tasks</div>
              <div className="text-xs text-muted-foreground">Items waiting on your decision</div>
            </div>
          </div>
          <ButtonLink href="/tasks" label="My Tasks" />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {canSeeAudit ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm">Recent Activity</CardTitle>
              <Link href="/audit" className="text-xs text-primary hover:underline">
                View all →
              </Link>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              {!summary ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="mx-4 my-2 h-9" />)
              ) : summary.recentAudit.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">No activity yet</p>
              ) : (
                summary.recentAudit.map((row) => (
                  <div key={row.id} className="flex items-center gap-3 border-t px-6 py-2.5 first:border-t-0">
                    <Badge variant={statusVariant(row.action)}>{row.action}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-medium">
                          {row.user ? `${row.user.firstName} ${row.user.lastName}` : 'System'}
                        </span>{' '}
                        · {titleCase(row.entityType)}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(row.createdOn)}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}

        {has('notification:read') ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm">Recent Notifications</CardTitle>
              <Link href="/notifications" className="text-xs text-primary hover:underline">
                View all →
              </Link>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              {!summary ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="mx-4 my-2 h-9" />)
              ) : summary.recentNotifications.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">No notifications yet</p>
              ) : (
                summary.recentNotifications.map((n) => (
                  <div key={n.id} className="flex items-center gap-3 border-t px-6 py-2.5 first:border-t-0">
                    <span className={n.isRead ? 'h-2 w-2 rounded-full bg-muted' : 'h-2 w-2 rounded-full bg-primary'} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(n.createdOn)}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function ButtonLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
      {label} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  // Platform admins manage the whole SaaS platform, not a tenant.
  if (user?.isPlatformAdmin) return <PlatformDashboard />;
  return <TenantDashboard />;
}
