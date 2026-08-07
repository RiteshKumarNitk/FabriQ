'use client';

import { GrnStatus } from '@fabriq/shared';
import { ProcurementListPage } from '@/components/procurement/list-page';
import { PStatus } from '@/components/procurement/status-badge';

const STATUS_OPTIONS = Object.values(GrnStatus).map((v) => ({ label: v.replace(/_/g, ' '), value: v }));

export default function GoodsReceiptsPage() {
  return (
    <ProcurementListPage
      title="Goods Receipt Notes"
      description="Record incoming fabric deliveries with roll-level detail — each roll then goes to inspection."
      apiPath="/goods-receipts"
      statusOptions={STATUS_OPTIONS}
      createHref="/procurement/goods-receipts/new"
      createLabel="New Goods Receipt"
      createPermission="grn:create"
      searchPlaceholder="Search by GRN number, invoice or vehicle…"
      rowHref={(r) => `/procurement/goods-receipts/${r.id}`}
      columns={[
        { key: 'number', label: 'Number', render: (r) => <span className="font-mono font-medium">{String(r.number)}</span> },
        { key: 'purchaseOrder', label: 'Purchase Order', render: (r) => (r.purchaseOrder as { number?: string })?.number ?? '—' },
        { key: 'supplier', label: 'Supplier', render: (r) => (r.supplier as { name?: string })?.name ?? '—' },
        { key: 'invoiceNumber', label: 'Invoice' },
        { key: 'receivedDate', label: 'Received' },
        { key: '_count', label: 'Rolls', render: (r) => String((r._count as { rolls?: number })?.rolls ?? '—') },
        { key: 'status', label: 'Status', render: (r) => <PStatus value={String(r.status)} /> },
      ]}
    />
  );
}
