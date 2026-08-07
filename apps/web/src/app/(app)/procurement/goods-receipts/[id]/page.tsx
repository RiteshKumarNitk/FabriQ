'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, PackageOpen, Pencil, ScanSearch, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { GrnStatus } from '@fabriq/shared';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PStatus } from '@/components/procurement/status-badge';
import { ActivityPanel } from '@/components/procurement/activity-panel';

interface GRN {
  id: string;
  number: string;
  invoiceNumber?: string | null;
  vehicleNumber?: string | null;
  receivedDate: string;
  status: string;
  remarks?: string | null;
  progress: number;
  rollsInspected: number;
  rollsTotal: number;
  supplier: { name: string };
  purchaseOrder: { id: string; number: string; status: string };
  rolls: Array<{
    id: string;
    rollNumber: string;
    fabricType?: string | null;
    color?: string | null;
    gsm?: number | null;
    width?: number | null;
    length?: number | null;
    weight?: number | null;
    batch?: string | null;
    lot?: string | null;
    barcode?: string | null;
    condition: string;
    status: string;
    inspection?: { id: string; decision: string; qualityScore: number } | null;
    warehouseReceipts?: Array<{ id: string; number: string }>;
  }>;
}

export default function GoodsReceiptDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { has } = useAuth();
  const [doc, setDoc] = useState<GRN | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDoc(await http.get<GRN>(`/goods-receipts/${params.id}`));
    } catch (e) {
      toast.error((e as Error).message ?? 'Goods receipt not found');
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

  if (loading || !doc) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const editable = doc.status === GrnStatus.DRAFT;
  const confirmable = doc.status === GrnStatus.DRAFT;
  const cancellable = [GrnStatus.DRAFT, GrnStatus.RECEIVED].includes(doc.status as GrnStatus);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/procurement/goods-receipts')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Goods Receipt Note</h2>
            <span className="font-mono text-sm text-muted-foreground">{doc.number}</span>
            <PStatus value={doc.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {doc.supplier.name} · PO <Link className="underline" href={`/procurement/purchase-orders/${doc.purchaseOrder.id}`}>{doc.purchaseOrder.number}</Link> · received {formatDate(doc.receivedDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <Button variant="outline" size="sm" onClick={() => router.push(`/procurement/goods-receipts/new?po=${doc.purchaseOrder.id}`)}>
              <Pencil /> Edit
            </Button>
          ) : null}
          {confirmable ? (
            <Button size="sm" disabled={busy} onClick={() => void action(`/goods-receipts/${doc.id}/confirm`, 'Goods receipt confirmed')}>
              <Loader2 className={busy ? 'animate-spin' : 'hidden'} /> Confirm receipt
            </Button>
          ) : null}
          {cancellable ? (
            <Button variant="outline" size="sm" className="text-destructive" disabled={busy} onClick={() => void action(`/goods-receipts/${doc.id}/cancel`, 'Goods receipt cancelled')}>
              <XCircle /> Cancel
            </Button>
          ) : null}
        </div>
      </div>

      {/* inspection progress */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Inspection progress</span>
            <span className="font-medium">{doc.rollsInspected} of {doc.rollsTotal} rolls decided</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${doc.progress}%` }} />
          </div>
          {doc.invoiceNumber || doc.vehicleNumber ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {doc.invoiceNumber ? `Invoice ${doc.invoiceNumber} · ` : ''}{doc.vehicleNumber ? `Vehicle ${doc.vehicleNumber}` : ''}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Roll</th>
                <th className="px-3 py-2.5 font-medium">Fabric</th>
                <th className="px-3 py-2.5 font-medium">Color</th>
                <th className="px-3 py-2.5 text-right font-medium">GSM</th>
                <th className="px-3 py-2.5 text-right font-medium">Len (m)</th>
                <th className="px-3 py-2.5 text-right font-medium">Wt (kg)</th>
                <th className="px-3 py-2.5 font-medium">Batch / Lot</th>
                <th className="px-3 py-2.5 font-medium">Condition</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {doc.rolls.map((roll, i) => (
                <tr key={roll.id} className={cn('border-b last:border-0', i % 2 && 'bg-muted/20')}>
                  <td className="px-3 py-2 font-mono text-xs font-medium">{roll.rollNumber}</td>
                  <td className="px-3 py-2">{roll.fabricType ?? '—'}</td>
                  <td className="px-3 py-2">{roll.color ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{roll.gsm ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{roll.length ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{roll.weight ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{roll.batch ?? '—'} / {roll.lot ?? '—'}</td>
                  <td className="px-3 py-2"><PStatus value={roll.condition} /></td>
                  <td className="px-3 py-2"><PStatus value={roll.status} /></td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {roll.status === 'PENDING_INSPECTION' && has('inspection:create') ? (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/procurement/inspections/new?roll=${roll.id}`}>
                            <ScanSearch /> Inspect
                          </Link>
                        </Button>
                      ) : null}
                      {['APPROVED', 'SECOND_QUALITY'].includes(roll.status) && has('warehousereceipt:create') ? (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/procurement/warehouse-receipts/new?roll=${roll.id}`}>
                            <PackageOpen /> Receive
                          </Link>
                        </Button>
                      ) : null}
                      {roll.inspection ? (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/procurement/inspections/${roll.inspection.id}`}>
                            {roll.inspection.qualityScore}%
                          </Link>
                        </Button>
                      ) : null}
                      {roll.warehouseReceipts?.length ? (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/procurement/warehouse-receipts/${roll.warehouseReceipts[0].id}`}>{roll.warehouseReceipts[0].number}</Link>
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ActivityPanel entityType="goods-receipts" entityId={doc.id} />
    </div>
  );
}
