'use client';

import { Priority, RequisitionStatus } from '@fabriq/shared';
import { ProcurementListPage } from '@/components/procurement/list-page';
import { PStatus } from '@/components/procurement/status-badge';

const STATUS_OPTIONS = Object.values(RequisitionStatus).map((v) => ({ label: v.replace(/_/g, ' '), value: v }));

export default function RequisitionsPage() {
  return (
    <ProcurementListPage
      title="Purchase Requisitions"
      description="Department requests for materials — approved requisitions become purchase orders."
      apiPath="/requisitions"
      statusOptions={STATUS_OPTIONS}
      createHref="/procurement/requisitions/new"
      createLabel="New Requisition"
      createPermission="requisition:create"
      searchPlaceholder="Search by number or remarks…"
      rowHref={(r) => `/procurement/requisitions/${r.id}`}
      columns={[
        { key: 'number', label: 'Number', render: (r) => <span className="font-mono font-medium">{String(r.number)}</span> },
        { key: 'requestDate', label: 'Requested' },
        { key: 'priority', label: 'Priority', render: (r) => <PStatus value={String(r.priority)} /> },
        { key: 'requestedBy', label: 'Requested By', render: (r) => {
          const u = r.requestedBy as { firstName?: string; lastName?: string } | null;
          return u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '—';
        } },
        { key: 'department', label: 'Department', render: (r) => (r.department as { name?: string })?.name ?? '—' },
        { key: 'expectedDate', label: 'Expected' },
        { key: '_count', label: 'Items', render: (r) => String((r._count as { items?: number })?.items ?? '—') },
        { key: 'status', label: 'Status', render: (r) => <PStatus value={String(r.status)} /> },
      ]}
    />
  );
}
