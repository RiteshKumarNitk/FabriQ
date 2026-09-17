'use client';

import { ProcurementListPage } from '@/components/procurement/list-page';
import { fromBase, LengthUnit } from '@fabriq/shared';
import { useAuth } from '@/lib/auth-context';

const LAY_STATUS = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

export default function LayPlansPage() {
  const { has } = useAuth();
  return (
    <ProcurementListPage
      title="Lay Plans"
      description="Marker × ply lays with their reserved fabric spans and output"
      apiPath="/lay-plans"
      statusOptions={LAY_STATUS.map((s) => ({ label: s.replace(/_/g, ' '), value: s }))}
      createPermission={undefined}
      searchPlaceholder="Search lay # or notes…"
      rowHref={(row) => `/cutting/lay-plans/${String(row.id)}`}
      columns={[
        { key: 'number', label: 'Lay ID', sortable: true, render: (r) => String(r.number ?? '—') },
        {
          key: 'cutOrder',
          label: 'Cut Order',
          render: (r) => {
            const co = r.cutOrder as { number?: string } | null | undefined;
            return co?.number ?? <span className="text-muted-foreground">—</span>;
          },
        },
        {
          key: 'marker',
          label: 'Marker',
          render: (r) => {
            const m = r.marker as { number?: string } | null | undefined;
            return m?.number ?? '—';
          },
        },
        {
          key: 'roll',
          label: 'Roll',
          render: (r) => {
            const roll = r.roll as { number?: string } | null | undefined;
            return roll?.number ?? '—';
          },
        },
        { key: 'ply', label: 'Ply', sortable: true },
        {
          key: 'markerLengthCm',
          label: 'Marker Length',
          sortable: true,
          render: (r) => `${fromBase(Number(r.markerLengthCm ?? 0), LengthUnit.METERS).toFixed(2)} m`,
        },
        {
          key: 'theoreticalPieces',
          label: 'Output',
          sortable: true,
          render: (r) => `${r.theoreticalPieces ?? 0} pcs`,
        },
        { key: 'status', label: 'Status', sortable: true },
        {
          key: 'createdOn',
          label: 'Created',
          render: (r) => (r.createdOn ? new Date(String(r.createdOn)).toLocaleDateString() : '—'),
        },
      ]}
      emptyText={
        has('cutorder:create')
          ? 'No lays yet — plan one from a cut order'
          : 'No lays yet'
      }
    />
  );
}
