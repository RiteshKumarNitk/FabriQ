import { Badge, statusVariant } from '@/components/ui/badge';

const LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  CONVERTED: 'Converted',
  COMPLETED: 'Completed',
  PARTIALLY_RECEIVED: 'Partially Received',
  RECEIVED: 'Received',
  PENDING_INSPECTION: 'Pending Inspection',
  RECEIVED_IN_WAREHOUSE: 'In Warehouse',
  SECOND_QUALITY: 'Second Quality',
  GOOD: 'Good',
  DAMAGED: 'Damaged',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  URGENT: 'Urgent',
  IN: 'In',
  OUT: 'Out',
  ADJUSTMENT: 'Adjustment',
};

/** Color-coded status badge with friendly labels for procurement documents. */
export function PStatus({ value, className }: { value?: string | null; className?: string }) {
  const key = String(value ?? '').toUpperCase();
  return (
    <Badge variant={statusVariant(key)} className={className}>
      {LABELS[key] ?? String(value ?? '—').replace(/_/g, ' ')}
    </Badge>
  );
}
