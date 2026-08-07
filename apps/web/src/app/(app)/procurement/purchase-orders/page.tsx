'use client';

import { PurchaseOrderStatus } from '@fabriq/shared';
import { ProcurementListPage } from '@/components/procurement/list-page';
import { PStatus } from '@/components/procurement/status-badge';
import { money, num } from '@/lib/utils';

const STATUS_OPTIONS = Object.values(PurchaseOrderStatus).map((v) => ({ label: v.replace(/_/g, ' '), value: v }));

export default function PurchaseOrdersPage() {
  return (
    <ProcurementListPage
      title="Purchase Orders"
      description="Approved supplier orders with partial-delivery tracking across goods receipts."
      apiPath="/purchase-orders"
      statusOptions={STATUS_OPTIONS}
      createHref="/procurement/purchase-orders/new"
      createLabel="New Purchase Order"
      createPermission="purchaseorder:create"
      searchPlaceholder="Search by number…"
      rowHref={(r) => `/procurement/purchase-orders/${r.id}`}
      columns={[
        { key: 'number', label: 'Number', render: (r) => <span className="font-mono font-medium">{String(r.number)}</span> },
        { key: 'supplier', label: 'Supplier', render: (r) => (r.supplier as { name?: string })?.name ?? '—' },
        { key: 'poDate', label: 'PO Date' },
        { key: 'deliveryDate', label: 'Delivery' },
        { key: 'currency', label: 'Cur' },
        { key: 'totalAmount', label: 'Total', render: (r) => money(r.totalAmount, String(r.currency ?? 'INR')) },
        { key: '_count', label: 'Items', render: (r) => String((r._count as { items?: number })?.items ?? '—') },
        { key: 'status', label: 'Status', render: (r) => <PStatus value={String(r.status)} /> },
      ]}
    />
  );
}
