'use client';

import { ProcurementListPage } from '@/components/procurement/list-page';

export default function WarehouseReceiptsPage() {
  return (
    <ProcurementListPage
      title="Warehouse Receipts"
      description="Approved rolls received into warehouse locations — each receipt posts a stock transaction."
      apiPath="/warehouse-receipts"
      createHref="/procurement/warehouse-receipts/new"
      createLabel="Receive Roll"
      createPermission="warehousereceipt:create"
      searchPlaceholder="Search by receipt number…"
      rowHref={(r) => `/procurement/warehouse-receipts/${r.id}`}
      columns={[
        { key: 'number', label: 'Number', render: (r) => <span className="font-mono font-medium">{String(r.number)}</span> },
        { key: 'grnRoll', label: 'Roll', render: (r) => (r.grnRoll as { rollNumber?: string })?.rollNumber ?? '—' },
        { key: 'grnRoll', label: 'GRN', render: (r) => (r.grnRoll as { grn?: { number?: string } })?.grn?.number ?? '—' },
        { key: 'warehouse', label: 'Warehouse', render: (r) => (r.warehouse as { name?: string })?.name ?? '—' },
        { key: 'rack', label: 'Rack' },
        { key: 'shelf', label: 'Shelf' },
        { key: 'bin', label: 'Bin' },
        { key: 'receivedOn', label: 'Received' },
      ]}
    />
  );
}
