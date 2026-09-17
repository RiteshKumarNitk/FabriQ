'use client';

import { MarkerStatus } from '@fabriq/shared';
import { ProcurementListPage } from '@/components/procurement/list-page';
import { PStatus } from '@/components/procurement/status-badge';
import { fmtLength, LengthUnit } from '@/lib/units';

const STATUS_OPTIONS = Object.values(MarkerStatus).map((v) => ({ label: v, value: v }));

export default function MarkersPage() {
  return (
    <ProcurementListPage
      title="Markers"
      description="Cutting layouts of pattern pieces with planning efficiency and size mix."
      apiPath="/markers"
      statusField="status"
      statusOptions={STATUS_OPTIONS}
      createHref="/cutting/markers/new"
      createLabel="New Marker"
      createPermission="marker:create"
      searchPlaceholder="Search by number, style, fabric…"
      rowHref={(r) => `/cutting/markers/${r.id}`}
      columns={[
        { key: 'number', label: 'Marker', sortable: true, render: (r) => <span className="font-mono font-medium">{String(r.number)}</span> },
        { key: 'styleRef', label: 'Style', sortable: true, render: (r) => (r.styleRef as string) ?? '—' },
        { key: 'fabricType', label: 'Fabric', sortable: true, render: (r) => (r.fabricType as string) ?? '—' },
        { key: 'color', label: 'Color', sortable: true, render: (r) => (r.color as string) ?? '—' },
        { key: 'widthCm', label: 'Width', sortable: true, render: (r) => fmtLength(Number(r.widthCm), LengthUnit.INCHES, 1) },
        { key: 'lengthCm', label: 'Length', sortable: true, render: (r) => fmtLength(Number(r.lengthCm), LengthUnit.METERS) },
        { key: 'garmentsPerMarker', label: 'Garments', sortable: true, render: (r) => String(r.garmentsPerMarker ?? '—') },
        { key: 'efficiencyPct', label: 'Efficiency', sortable: true, render: (r) => `${Number(r.efficiencyPct ?? 0).toFixed(1)}%` },
        { key: 'pieces', label: 'Pieces', render: (r) => String((r._count as { pieces?: number })?.pieces ?? '—') },
        { key: 'status', label: 'Status', sortable: true, render: (r) => <PStatus value={String(r.status)} /> },
      ]}
    />
  );
}
