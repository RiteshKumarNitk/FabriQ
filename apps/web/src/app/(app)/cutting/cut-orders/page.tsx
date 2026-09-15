'use client';

import { CutOrderStatus } from '@fabriq/shared';
import { ProcurementListPage } from '@/components/procurement/list-page';
import { PStatus } from '@/components/procurement/status-badge';

const STATUS_OPTIONS = Object.values(CutOrderStatus).map((v) => ({ label: v.replace(/_/g, ' '), value: v }));

export default function CutOrdersPage() {
  return (
    <ProcurementListPage
      title="Cut Orders"
      description="Production cutting requirements per style and color, fulfilled by lays and markers."
      apiPath="/cut-orders"
      statusField="status"
      statusOptions={STATUS_OPTIONS}
      createHref="/cutting/cut-orders/new"
      createLabel="New Cut Order"
      createPermission="cutorder:create"
      searchPlaceholder="Search by number, style, color…"
      rowHref={(r) => `/cutting/cut-orders/${r.id}`}
      columns={[
        { key: 'number', label: 'Order', render: (r) => <span className="font-mono font-medium">{String(r.number)}</span> },
        { key: 'styleRef', label: 'Style', render: (r) => (r.styleRef as string) ?? '—' },
        { key: 'color', label: 'Color', render: (r) => (r.color as string) ?? '—' },
        { key: 'requiredJson', label: 'Required', render: (r) => {
          const req = (r.requiredJson ?? {}) as Record<string, number>;
          const total = Object.values(req).reduce((s, v) => s + Number(v), 0);
          return <span className="tabular-nums">{total.toLocaleString()} pcs</span>;
        } },
        { key: 'layPlans', label: 'Lays', render: (r) => String((r._count as { layPlans?: number })?.layPlans ?? '—') },
        { key: 'status', label: 'Status', render: (r) => <PStatus value={String(r.status)} /> },
      ]}
    />
  );
}
