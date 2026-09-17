'use client';

import { ProcurementListPage } from '@/components/procurement/list-page';
import { useAuth } from '@/lib/auth-context';

export default function PatternsPage() {
  const { has } = useAuth();
  return (
    <ProcurementListPage
      title="Pattern Library"
      description="Style-level pattern sets — versioned, never overwritten in place"
      apiPath="/pattern-sets"
      createHref="/cutting/patterns/new"
      createLabel="New pattern set"
      createPermission="pattern:create"
      searchPlaceholder="Search code, name, style…"
      rowHref={(row) => `/cutting/patterns/${String(row.id)}`}
      columns={[
        { key: 'code', label: 'Code', sortable: true },
        { key: 'name', label: 'Name', sortable: true },
        { key: 'styleRef', label: 'Style', sortable: true },
        { key: 'version', label: 'Version', render: (r) => `v${r.version ?? 1}` },
        {
          key: '_count',
          label: 'Pieces',
          render: (r) => String((r._count as { pieces?: number } | undefined)?.pieces ?? 0),
        },
        { key: 'status', label: 'Status' },
        {
          key: 'createdOn',
          label: 'Created',
          render: (r) => (r.createdOn ? new Date(String(r.createdOn)).toLocaleDateString() : '—'),
        },
      ]}
      emptyText={
        has('pattern:create')
          ? 'No pattern sets yet — create the first one'
          : 'No pattern sets yet'
      }
    />
  );
}
