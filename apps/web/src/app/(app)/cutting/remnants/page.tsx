'use client';

import { ProcurementListPage } from '@/components/procurement/list-page';
import { fromBase, LengthUnit } from '@fabriq/shared';

const REMNANT_STATUS = ['AVAILABLE', 'RESERVED', 'CONSUMED', 'ARCHIVED'];

export default function RemnantsPage() {
  return (
    <ProcurementListPage
      title="Remnants"
      description="Physically separated usable leftovers created by closing rolls"
      apiPath="/remnants"
      statusOptions={REMNANT_STATUS.map((s) => ({ label: s, value: s }))}
      searchPlaceholder="Search remnant #, fabric, location…"
      rowHref={(row) => `/cutting/rolls/${String((row.sourceRoll as { id?: string } | null)?.id ?? '')}`}
      columns={[
        { key: 'number', label: 'Remnant', sortable: true, render: (r) => String(r.number ?? '—') },
        {
          key: 'sourceRoll',
          label: 'Parent Roll',
          render: (r) => {
            const roll = r.sourceRoll as { number?: string } | null | undefined;
            return roll?.number ?? '—';
          },
        },
        { key: 'fabricName', label: 'Fabric', sortable: true },
        { key: 'color', label: 'Color', sortable: true },
        { key: 'shadeLot', label: 'Shade/Lot', sortable: true },
        {
          key: 'lengthCm',
          label: 'Length',
          sortable: true,
          render: (r) => `${fromBase(Number(r.lengthCm ?? 0), LengthUnit.METERS).toFixed(2)} m`,
        },
        {
          key: 'widthCm',
          label: 'Width',
          sortable: true,
          render: (r) => `${fromBase(Number(r.widthCm ?? 0), LengthUnit.INCHES).toFixed(1)}"`,
        },
        {
          key: 'usableWidthCm',
          label: 'Usable',
          sortable: true,
          render: (r) => `${fromBase(Number(r.usableWidthCm ?? 0), LengthUnit.INCHES).toFixed(1)}"`,
        },
        { key: 'location', label: 'Location', sortable: true },
        { key: 'status', label: 'Status', sortable: true },
        {
          key: 'createdOn',
          label: 'Created',
          render: (r) => (r.createdOn ? new Date(String(r.createdOn)).toLocaleDateString() : '—'),
        },
      ]}
      emptyText="No remnants yet — close a roll with usable fabric left to create one"
    />
  );
}
