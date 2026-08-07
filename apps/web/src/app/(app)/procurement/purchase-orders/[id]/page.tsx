'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, FileText, Loader2, PackageOpen, Pencil, Printer, Send, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PurchaseOrderStatus } from '@fabriq/shared';
import { http, API_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn, formatDate, money, num, qty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PStatus } from '@/components/procurement/status-badge';
import { ActivityPanel } from '@/components/procurement/activity-panel';

interface PO {
  id: string;
  number: string;
  poDate: string;
  deliveryDate?: string | null;
  currency: string;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  taxPercent: number;
  discountPercent: number;
  subTotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  status: string;
  notes?: string | null;
  supplier: { name: string; code: string; gstin?: string | null; billingAddress?: string | null; city?: string | null };
  requisition?: { id: string; number: string } | null;
  items: Array<{
    id: string;
    itemName: string;
    description?: string | null;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
    gstPercent: number;
    receivedQty: number;
  }>;
  receipts: Array<{ id: string; number: string; status: string; invoiceNumber?: string | null; receivedDate: string }>;
}

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { has } = useAuth();
  const [doc, setDoc] = useState<PO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDoc(await http.get<PO>(`/purchase-orders/${params.id}`));
    } catch (e) {
      toast.error((e as Error).message ?? 'Purchase order not found');
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

  async function printPo() {
    try {
      const res = await fetch(`${API_URL}/purchase-orders/${doc?.id}/print`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('fabriq_access_token')}` },
      });
      if (!res.ok) throw new Error('Print document unavailable');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) {
      toast.error((e as Error).message ?? 'Print failed');
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

  const status = doc.status as PurchaseOrderStatus;
  const editable = status === PurchaseOrderStatus.DRAFT;
  const cancellable = [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SUBMITTED, PurchaseOrderStatus.APPROVED].includes(status);
  const canReceive = [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED].includes(status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/procurement/purchase-orders')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Purchase Order</h2>
            <span className="font-mono text-sm text-muted-foreground">{doc.number}</span>
            <PStatus value={doc.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {doc.supplier.name} · PO date {formatDate(doc.poDate)}
            {doc.requisition ? ` · from ${doc.requisition.number}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void printPo()}>
            <Printer /> Print
          </Button>
          {editable ? (
            <Button variant="outline" size="sm" onClick={() => router.push(`/procurement/purchase-orders/new?id=${doc.id}`)}>
              <Pencil /> Edit
            </Button>
          ) : null}
          {editable && has('purchaseorder:approve') ? (
            <Button size="sm" disabled={busy} onClick={() => void action(`/purchase-orders/${doc.id}/submit`, 'Submitted for approval')}>
              <Send /> Submit
            </Button>
          ) : null}
          {status === PurchaseOrderStatus.SUBMITTED && has('purchaseorder:approve') ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => void action(`/purchase-orders/${doc.id}/approve`, 'Purchase order approved')}>
                <Check /> Approve
              </Button>
              <Button variant="outline" size="sm" className="text-destructive" disabled={busy} onClick={() => void action(`/purchase-orders/${doc.id}/reject`, 'Sent back to draft')}>
                <X /> Reject
              </Button>
            </>
          ) : null}
          {canReceive ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/procurement/goods-receipts/new?po=${doc.id}`}>
                <PackageOpen /> Create Goods Receipt
              </Link>
            </Button>
          ) : null}
          {cancellable ? (
            <Button variant="outline" size="sm" className="text-destructive" disabled={busy} onClick={() => void action(`/purchase-orders/${doc.id}/cancel`, 'Purchase order cancelled')}>
              <XCircle /> Cancel
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supplier</div>
              <div className="mt-0.5 text-sm font-medium">{doc.supplier.name}</div>
              {doc.supplier.gstin ? <div className="text-xs text-muted-foreground">GSTIN {doc.supplier.gstin}</div> : null}
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery</div>
              <div className="mt-0.5 text-sm">{doc.deliveryDate ? formatDate(doc.deliveryDate) : '—'}</div>
              <div className="text-xs text-muted-foreground">{doc.deliveryTerms ?? ''}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment</div>
              <div className="mt-0.5 text-sm">{doc.paymentTerms ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</div>
              <div className="mt-0.5 text-base font-semibold">{money(doc.totalAmount, doc.currency)}</div>
            </div>
          </div>
          {doc.notes ? <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{doc.notes}</p> : null}
        </CardContent>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                <th className="px-4 py-2.5 font-medium">Unit</th>
                <th className="px-4 py-2.5 text-right font-medium">Rate</th>
                <th className="px-4 py-2.5 text-right font-medium">GST</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 text-right font-medium">Received</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((item, i) => {
                const progress = Math.min(100, Math.round((num(item.receivedQty) / num(item.quantity)) * 100));
                return (
                  <tr key={item.id} className={cn('border-b last:border-0', i % 2 && 'bg-muted/20')}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{item.itemName}</div>
                      {item.description ? <div className="text-xs text-muted-foreground">{item.description}</div> : null}
                    </td>
                    <td className="px-4 py-2.5 text-right">{qty(item.quantity)}</td>
                    <td className="px-4 py-2.5">{item.unit}</td>
                    <td className="px-4 py-2.5 text-right">{money(item.rate, doc.currency)}</td>
                    <td className="px-4 py-2.5 text-right">{num(item.gstPercent).toFixed(0)}%</td>
                    <td className="px-4 py-2.5 text-right font-medium">{money(item.amount, doc.currency)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-muted-foreground">{qty(item.receivedQty)} / {qty(item.quantity)}</span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col items-end gap-1 border-t px-4 py-3 text-sm">
          <div className="flex w-full max-w-xs justify-between text-muted-foreground">
            <span>Subtotal</span><span>{money(doc.subTotal, doc.currency)}</span>
          </div>
          <div className="flex w-full max-w-xs justify-between text-muted-foreground">
            <span>Discount ({num(doc.discountPercent).toFixed(0)}%)</span><span>−{money(doc.discountAmount, doc.currency)}</span>
          </div>
          <div className="flex w-full max-w-xs justify-between text-muted-foreground">
            <span>Tax ({num(doc.taxPercent).toFixed(0)}%)</span><span>{money(doc.taxAmount, doc.currency)}</span>
          </div>
          <div className="flex w-full max-w-xs justify-between border-t pt-1 font-semibold">
            <span>Total</span><span>{money(doc.totalAmount, doc.currency)}</span>
          </div>
        </div>
      </Card>

      {doc.receipts.length > 0 ? (
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goods Receipts</p>
            <div className="space-y-1">
              {doc.receipts.map((grn) => (
                <Link key={grn.id} href={`/procurement/goods-receipts/${grn.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">{grn.number}</span>
                  {grn.invoiceNumber ? <span className="text-xs text-muted-foreground">inv. {grn.invoiceNumber}</span> : null}
                  <span className="ml-auto text-xs text-muted-foreground">{formatDate(grn.receivedDate)}</span>
                  <PStatus value={grn.status} />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ActivityPanel entityType="purchase-orders" entityId={doc.id} />
    </div>
  );
}
