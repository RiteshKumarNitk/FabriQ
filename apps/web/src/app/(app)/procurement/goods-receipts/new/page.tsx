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
import { RollsEditor, type RollRow } from '@/components/procurement/rolls-editor';
import { useRefOptions } from '@/components/procurement/use-ref-options';

interface POOption {
  value: string;
  label: string;
  row: Record<string, unknown>;
}

export default function GoodsReceiptFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const poParam = searchParams.get('po');

  const poOptions = useRefOptions('/purchase-orders');

  const [poId, setPoId] = useState(poParam ?? '');
  const [poItems, setPoItems] = useState<Array<{ id: string; label: string }>>([]);
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [rolls, setRolls] = useState<RollRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!poId) {
      setPoItems([]);
      setSupplierName('');
      return;
    }
    http
      .get<{ supplier: { name: string }; items: Array<Record<string, unknown>> }>(`/purchase-orders/${poId}`)
      .then((po) => {
        setSupplierName(po.supplier.name);
        setPoItems(
          po.items.map((i) => ({
            id: String(i.id),
            label: `${String(i.itemName)} · ${String(i.quantity)} ${String(i.unit)}`,
          })),
        );
      })
      .catch((e) => toast.error((e as Error).message ?? 'Could not load purchase order'));
  }, [poId]);

  const submit = useCallback(async () => {
    if (!poId) {
      toast.error('Select a purchase order');
      return;
    }
    if (rolls.length === 0 || rolls.some((r) => !r.rollNumber.trim())) {
      toast.error('Add at least one roll with a roll number');
      return;
    }
    setSubmitting(true);
    try {
      const doc = await http.post<{ id: string }>('/goods-receipts', {
        purchaseOrderId: poId,
        invoiceNumber: invoiceNumber || undefined,
        invoiceDate: invoiceDate ? new Date(invoiceDate).toISOString() : undefined,
        vehicleNumber: vehicleNumber || undefined,
        receivedDate: receivedDate ? new Date(receivedDate).toISOString() : undefined,
        remarks: remarks || undefined,
        rolls: rolls.map(({ rollNumber, fabricType, color, gsm, width, length, weight, batch, lot, barcode, qrCode, condition, purchaseOrderItemId }) => ({
          rollNumber: rollNumber.trim(),
          fabricType: fabricType?.trim() || undefined,
          color: color?.trim() || undefined,
          gsm: gsm || undefined,
          width: width || undefined,
          length: length || undefined,
          weight: weight || undefined,
          batch: batch?.trim() || undefined,
          lot: lot?.trim() || undefined,
          barcode: barcode?.trim() || undefined,
          qrCode: qrCode?.trim() || undefined,
          condition,
          purchaseOrderItemId: purchaseOrderItemId || undefined,
        })),
      });
      toast.success('Goods receipt created');
      router.push(`/procurement/goods-receipts/${doc.id}`);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to create goods receipt');
    } finally {
      setSubmitting(false);
    }
  }, [poId, invoiceNumber, invoiceDate, vehicleNumber, receivedDate, remarks, rolls, router]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/procurement/goods-receipts')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">New Goods Receipt</h2>
          <p className="text-sm text-muted-foreground">Capture every roll received — the GRN number is assigned automatically.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Receipt Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="po">Purchase Order *</Label>
            <Select id="po" value={poId} onChange={(e) => setPoId(e.target.value)}>
              <option value="">Select purchase order…</option>
              {poOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            {supplierName ? <p className="text-xs text-muted-foreground">Supplier: {supplierName}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoiceNumber">Invoice Number</Label>
            <Input id="invoiceNumber" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-2026-001" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoiceDate">Invoice Date</Label>
            <Input id="invoiceDate" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vehicleNumber">Vehicle Number</Label>
            <Input id="vehicleNumber" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="e.g. TN39 AB 1234" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="receivedDate">Received Date</Label>
            <Input id="receivedDate" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Input id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Rolls ({rolls.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <RollsEditor rolls={rolls} onChange={setRolls} poItems={poItems} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href="/procurement/goods-receipts">Cancel</Link>
        </Button>
        <Button onClick={() => void submit()} disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <Save />}
          Create goods receipt
        </Button>
      </div>
    </div>
  );
}
