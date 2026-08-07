'use client';

import { InspectionDecision } from '@fabriq/shared';
import { ProcurementListPage } from '@/components/procurement/list-page';
import { PStatus } from '@/components/procurement/status-badge';

const DECISION_OPTIONS = Object.values(InspectionDecision).map((v) => ({ label: v.replace(/_/g, ' '), value: v }));

export default function InspectionsPage() {
  return (
    <ProcurementListPage
      title="Fabric Inspections"
      description="4-point inspection of every received roll — only approved rolls move to the warehouse."
      apiPath="/inspections"
      statusField="decision"
      statusOptions={DECISION_OPTIONS}
      createHref="/procurement/inspections/new"
      createLabel="New Inspection"
      createPermission="inspection:create"
      searchPlaceholder="Search by number or remarks…"
      rowHref={(r) => `/procurement/inspections/${r.id}`}
      columns={[
        { key: 'number', label: 'Number', render: (r) => <span className="font-mono font-medium">{String(r.number)}</span> },
        { key: 'grnRoll', label: 'Roll', render: (r) => (r.grnRoll as { rollNumber?: string })?.rollNumber ?? '—' },
        { key: 'grnRoll', label: 'GRN', render: (r) => (r.grnRoll as { grn?: { number?: string } })?.grn?.number ?? '—' },
        { key: 'decision', label: 'Decision', render: (r) => <PStatus value={String(r.decision)} /> },
        { key: 'totalPoints', label: 'Points', render: (r) => String((r as { totalPoints?: number }).totalPoints ?? '—') },
        { key: 'qualityScore', label: 'Score', render: (r) => `${String((r as { qualityScore?: number }).qualityScore ?? '—')}%` },
        { key: 'inspector', label: 'Inspector', render: (r) => {
          const u = r.inspector as { firstName?: string; lastName?: string } | null;
          return u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '—';
        } },
        { key: 'inspectionDate', label: 'Inspected' },
      ]}
    />
  );
}
