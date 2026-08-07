'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, FileText, Loader2, Pencil, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { RequisitionStatus } from '@fabriq/shared';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn, formatDate, qty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PStatus } from '@/components/procurement/status-badge';
import { ActivityPanel } from '@/components/procurement/activity-panel';
import { useRefOptions } from '@/components/procurement/use-ref-options';

interface Requisition {
  id: string;
  number: string;
  requestDate: string;
  priority: string;
  expectedDate?: string | null;
  status: string;
  remarks?: string | null;
  requestedById?: string | null;
  requestedBy?: { firstName?: string; lastName?: string } | null;
  department?: { name?: string } | null;
  items: Array<{
    id: string;
    itemName: string;
    description?: string | null;
    quantity: number;
    unit: string;
    remarks?: string | null;
  }>;
  purchaseOrders?: Array<{ id: string; number: string; status: string }>;
}

export default function RequisitionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { has } = useAuth();
  const [doc, setDoc] = useState<Requisition | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const suppliers = useRefOptions('/suppliers');

  const load = useCallback(async () => {
    try {
      setDoc(await http.get<Requisition>(`/requisitions/${params.id}`));
    } catch (e) {
      toast.error((e as Error).message ?? 'Requisition not found');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(path: string, successMsg: string) {
    setBusy(true);
    try {
      await http.post(path);
      toast.success(successMsg);
      void load();
    } catch (e) {
      toast.error((e as Error).message ?? 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    if (!supplierId) {
      toast.error('Select a supplier to create the purchase order');
      return;
    }
    setBusy(true);
    try {
      const po = await http.post<{ id: string }>(`/requisitions/${params.id}/convert`, { supplierId });
      toast.success('Purchase order created');
      router.push(`/procurement/purchase-orders/${po.id}`);
    } catch (e) {
      toast.error((e as Error).message ?? 'Conversion failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !doc) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const editable = doc.status === RequisitionStatus.DRAFT;
  const cancellable = [RequisitionStatus.DRAFT, RequisitionStatus.SUBMITTED].includes(doc.status as RequisitionStatus);
  const convertible = doc.status === RequisitionStatus.APPROVED;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/procurement/requisitions')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Purchase Requisition</h2>
            <span className="font-mono text-sm text-muted-foreground">{doc.number}</span>
            <PStatus value={doc.status} />
          </div>
          <p className="text-xs text-muted-foreground">Requested {formatDate(doc.requestDate)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <>
              <Button variant="outline" size="sm" onClick={() => router.push(`/procurement/requisitions/new?id=${doc.id}`)}>
                <Pencil /> Edit
              </Button>
              {has('requisition:approve') ? (
                <Button size="sm" disabled={busy} onClick={() => void action(`/requisitions/${doc.id}/submit`, 'Submitted for approval')}>
                  <Send /> Submit for approval
                </Button>
              ) : null}
            </>
          ) : null}
          {cancellable ? (
            <Button variant="outline" size="sm" className="text-destructive" disabled={busy} onClick={() => void action(`/requisitions/${doc.id}/cancel`, 'Requisition cancelled')}>
              <XCircle /> Cancel
            </Button>
          ) : null}
          {convertible && has('requisition:approve') ? (
            <Button size="sm" disabled={busy} onClick={() => setConvertOpen(true)}>
              <ArrowRight /> Convert to Purchase Order
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-x-8 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Requested By" value={doc.requestedBy ? `${doc.requestedBy.firstName} ${doc.requestedBy.lastName}`.trim() : '—'} />
          <Field label="Department" value={doc.department?.name ?? '—'} />
          <Field label="Priority" value={doc.priority} />
          <Field label="Expected By" value={doc.expectedDate ? formatDate(doc.expectedDate) : '—'} />
          {doc.remarks ? <Field label="Remarks" value={doc.remarks} className="lg:col-span-4" /> : null}
        </CardContent>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                <th className="px-4 py-2.5 font-medium">Unit</th>
                <th className="px-4 py-2.5 font-medium">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((item, i) => (
                <tr key={item.id} className={cn('border-b last:border-0', i % 2 && 'bg-muted/20')}>
                  <td className="px-4 py-2.5 font-medium">{item.itemName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{item.description ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">{qty(item.quantity)}</td>
                  <td className="px-4 py-2.5">{item.unit}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{item.remarks ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {doc.purchaseOrders && doc.purchaseOrders.length > 0 ? (
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Created Purchase Orders</p>
            <div className="space-y-1">
              {doc.purchaseOrders.map((po) => (
                <Link key={po.id} href={`/procurement/purchase-orders/${po.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">{po.number}</span>
                  <PStatus value={po.status} />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ActivityPanel entityType="requisitions" entityId={doc.id} />

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Convert to Purchase Order</DialogTitle>
            <DialogDescription>
              Creates a draft purchase order from {doc.number} with the current items. Rates are added in the purchase order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="Select supplier…">
              {suppliers.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button disabled={busy} onClick={() => void convert()}>
              {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />} Convert
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}
