'use client';

import { FabricRollStatus } from '@fabriq/shared';
import { ProcurementListPage } from '@/components/procurement/list-page';
import { PStatus } from '@/components/procurement/status-badge';
import { fmtLength, LengthUnit } from '@/lib/units';

const STATUS_OPTIONS = Object.values(FabricRollStatus).map((v) => ({ label: v.replace(/_/g, ' '), value: v }));

function fmtWidth(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v == null || v === '') return '—';
  return fmtLength(Number(v), LengthUnit.CM, 0).replace(/ \w+$/, ''); // width shown in cm for the list
}

export default function FabricRollsPage() {
  return (
    <ProcurementListPage
      title="Fabric Rolls"
      description="Continuous fabric rolls with measurement, inspection, marker planning and consumption tracking."
      apiPath="/fabric-rolls"
      statusField="status"
      statusOptions={STATUS_OPTIONS}
      createHref="/cutting/rolls/new"
      createLabel="New Roll"
      createPermission="roll:create"
      searchPlaceholder="Search by number, fabric, color, lot…"
      rowHref={(r) => `/cutting/rolls/${r.id}`}
      columns={[
        { key: 'number', label: 'Roll', render: (r) => <span className="font-mono font-medium">{String(r.number)}</span> },
        { key: 'fabricName', label: 'Fabric', render: (r) => (r.fabricName as string) ?? (r.fabricType as string) ?? '—' },
        { key: 'color', label: 'Color', render: (r) => (r.color as string) ?? '—' },
        { key: 'shadeLot', label: 'Lot', render: (r) => (r.shadeLot as string) ?? '—' },
        { key: 'gsm', label: 'GSM', render: (r) => (r.gsm != null ? String(r.gsm) : '—') },
        { key: 'originalLengthCm', label: 'Original', render: (r) => (r.originalLengthCm != null ? fmtLength(Number(r.originalLengthCm), LengthUnit.METERS) : '—') },
        { key: 'remainingLengthCm', label: 'Remaining', render: (r) => (r.remainingLengthCm != null ? fmtLength(Number(r.remainingLengthCm), LengthUnit.METERS) : '—') },
        { key: 'widthCm', label: 'Width', render: (r) => fmtWidth(r, 'widthCm') },
        { key: 'usableWidthCm', label: 'Usable', render: (r) => fmtWidth(r, 'usableWidthCm') },
        { key: 'status', label: 'Status', render: (r) => <PStatus value={String(r.status)} /> },
      ]}
    />
  );
}
