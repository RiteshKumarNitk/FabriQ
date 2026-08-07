'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ItemsEditor, type LineItem } from '@/components/procurement/items-editor';
import { useRefOptions } from '@/components/procurement/use-ref-options';

export default function PurchaseOrderFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requisitionId = searchParams.get('requisition');

  const suppliers = useRefOptions('/suppliers');

  const [supplierId, setSupplierId] = useState('');
  const [poDate, setPoDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  const [taxPercent, setTaxPercent] = useState(5);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Prefill from an approved requisition (?requisition=id) — items carry the link back.
  useEffect(() => {
    if (!requisitionId) return;
    http
      .get<{ items: Array<Record<string, unknown>> }>(`/requisitions/${requisitionId}`)
      .then((doc) => {
        setItems(
          ((doc.items as unknown as Array<Record<string, unknown>>) ?? []).map((i) => ({
            requisitionItemId: String(i.id),
            itemName: String(i.itemName ?? ''),
            description: (i.description as string) ?? '',
            quantity: Number(i.quantity),
            unit: String(i.unit ?? 'METERS'),
            rate: 0,
            gstPercent: taxPercent,
          })),
        );
      })
      .catch((e) => toast.error((e as Error).message ?? 'Could not load requisition'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requisitionId]);

  const submit = useCallback(async () => {
    if (!supplierId) {
      toast.error('Select a supplier');
      return;
    }
    if (items.length === 0 || items.some((i) => !i.itemName.trim() || !i.quantity || i.quantity <= 0)) {
      toast.error('Add at least one item with a name and a quantity greater than zero');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        supplierId,
        requisitionId: requisitionId || undefined,
        poDate: poDate ? new Date(poDate).toISOString() : undefined,
        deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : undefined,
        currency,
        paymentTerms: paymentTerms || undefined,
        deliveryTerms: deliveryTerms || undefined,
        taxPercent,
        discountPercent,
        notes: notes || undefined,
        items: items.map(({ itemName, description, quantity, unit, rate, gstPercent: gst, requisitionItemId: rid }) => ({
          requisitionItemId: rid,
          itemName: itemName.trim(),
          description: description?.trim() || undefined,
          quantity,
          unit,
          rate,
          gstPercent: gst ?? 0,
        })),
      };
      const doc = await http.post<{ id: string }>('/purchase-orders', payload);
      toast.success('Purchase order created');
      router.push(`/procurement/purchase-orders/${doc.id}`);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to create purchase order');
    } finally {
      setSubmitting(false);
    }
  }, [supplierId, requisitionId, poDate, deliveryDate, currency, paymentTerms, deliveryTerms, taxPercent, discountPercent, notes, items, router]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/procurement/purchase-orders')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">New Purchase Order</h2>
          <p className="text-sm text-muted-foreground">
            {requisitionId ? 'Created from an approved requisition.' : 'Create a standalone order — the PO number is assigned automatically.'}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Order Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="supplier">Supplier *</Label>
            <Select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="poDate">PO Date</Label>
            <Input id="poDate" type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deliveryDate">Delivery Date</Label>
            <Input id="deliveryDate" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Input id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={8} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paymentTerms">Payment Terms</Label>
            <Input id="paymentTerms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 30 days from invoice" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deliveryTerms">Delivery Terms</Label>
            <Input id="deliveryTerms" value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} placeholder="e.g. Ex-works" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="taxPercent">Tax %</Label>
              <Input id="taxPercent" type="number" min={0} max={100} value={taxPercent} onChange={(e) => setTaxPercent(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discountPercent">Discount %</Label>
              <Input id="discountPercent" type="number" min={0} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Items & Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemsEditor items={items} onChange={setItems} pricing taxPercent={taxPercent} discountPercent={discountPercent} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href="/procurement/purchase-orders">Cancel</Link>
        </Button>
        <Button onClick={() => void submit()} disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <Save />}
          Create purchase order
        </Button>
      </div>
    </div>
  );
}
