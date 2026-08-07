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
import { useRefOptions } from '@/components/procurement/use-ref-options';

interface ApprovedRoll {
  id: string;
  rollNumber: string;
  fabricType?: string | null;
  status: string;
  length?: number | null;
  weight?: number | null;
  batch?: string | null;
  lot?: string | null;
  grn: { number: string };
  purchaseOrderItem?: { itemName: string; unit: string; rate: number } | null;
  inspection?: { decision: string; qualityScore: number } | null;
}

export default function WarehouseReceiptFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rollParam = searchParams.get('roll');

  const warehouses = useRefOptions('/warehouses');
  const [approvedRolls, setApprovedRolls] = useState<ApprovedRoll[]>([]);
  const [rollId, setRollId] = useState(rollParam ?? '');
  const [warehouseId, setWarehouseId] = useState('');
  const [rack, setRack] = useState('');
  const [shelf, setShelf] = useState('');
  const [bin, setBin] = useState('');
  const [receivedOn, setReceivedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    http
      .get<ApprovedRoll[]>('/warehouse-receipts/approved-rolls')
      .then((rows) => {
        setApprovedRolls(rows);
        if (!rollParam && rows.length === 1) setRollId(rows[0].id);
      })
      .catch(() => setApprovedRolls([]));
  }, [rollParam]);

  const roll = approvedRolls.find((r) => r.id === rollId);

  const submit = useCallback(async () => {
    if (!rollId) {
      toast.error('Select the roll to receive');
      return;
    }
    if (!warehouseId) {
      toast.error('Select a warehouse');
      return;
    }
    setSubmitting(true);
    try {
      const doc = await http.post<{ id: string }>('/warehouse-receipts', {
        grnRollId: rollId,
        warehouseId,
        rack: rack || undefined,
        shelf: shelf || undefined,
        bin: bin || undefined,
        receivedOn: receivedOn ? new Date(receivedOn).toISOString() : undefined,
      });
      toast.success('Roll received into warehouse — stock updated');
      router.push(`/procurement/warehouse-receipts/${doc.id}`);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to receive roll');
    } finally {
      setSubmitting(false);
    }
  }, [rollId, warehouseId, rack, shelf, bin, receivedOn, router]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/procurement/warehouse-receipts')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Warehouse Receipt</h2>
          <p className="text-sm text-muted-foreground">Only inspected (approved / second quality) rolls can be received — this posts the stock transaction.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Roll</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="roll">Approved Roll *</Label>
            <Select id="roll" value={rollId} onChange={(e) => setRollId(e.target.value)}>
              <option value="">Select a roll…</option>
              {approvedRolls.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.rollNumber} · GRN {r.grn.number} {r.fabricType ? `· ${r.fabricType}` : ''}
                </option>
              ))}
            </Select>
            {roll ? (
              <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-3">
                <div><span className="text-muted-foreground">Item: </span>{roll.purchaseOrderItem?.itemName ?? '—'}</div>
                <div><span className="text-muted-foreground">Length: </span>{roll.length ? `${roll.length} m` : '—'}</div>
                <div><span className="text-muted-foreground">Weight: </span>{roll.weight ? `${roll.weight} kg` : '—'}</div>
                <div><span className="text-muted-foreground">Batch/Lot: </span>{roll.batch ?? '—'} / {roll.lot ?? '—'}</div>
                <div><span className="text-muted-foreground">Grade: </span>{roll.inspection?.decision ?? '—'} ({roll.inspection?.qualityScore ?? '—'}%)</div>
                <div><span className="text-muted-foreground">Unit cost: </span>{roll.purchaseOrderItem?.rate ? `₹ ${Number(roll.purchaseOrderItem.rate).toFixed(2)}` : '—'}</div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Location</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="warehouse">Warehouse *</Label>
            <Select id="warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Select warehouse…</option>
              {warehouses.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rack">Rack</Label>
            <Input id="rack" value={rack} onChange={(e) => setRack(e.target.value)} placeholder="e.g. A" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shelf">Shelf</Label>
            <Input id="shelf" value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="e.g. 1" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bin">Bin</Label>
            <Input id="bin" value={bin} onChange={(e) => setBin(e.target.value)} placeholder="e.g. B2" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="receivedOn">Received On</Label>
            <Input id="receivedOn" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href="/procurement/warehouse-receipts">Cancel</Link>
        </Button>
        <Button onClick={() => void submit()} disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <Save />}
          Receive into warehouse
        </Button>
      </div>
    </div>
  );
}
