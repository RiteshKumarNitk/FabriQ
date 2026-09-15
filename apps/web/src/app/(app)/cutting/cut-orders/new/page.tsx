'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SizeRow {
  key: string;
  size: string;
  qty: string;
}

export default function NewCutOrderPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ styleRef: '', color: '', fabricType: '', notes: '' });
  const [rows, setRows] = useState<SizeRow[]>([
    { key: 's1', size: 'M', qty: '200' },
    { key: 's2', size: 'L', qty: '300' },
    { key: 's3', size: 'XL', qty: '200' },
  ]);

  const total = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const required: Record<string, number> = {};
    for (const r of rows) {
      const size = r.size.trim().toUpperCase();
      const qty = Number(r.qty) || 0;
      if (size && qty > 0) required[size] = qty;
    }
    if (Object.keys(required).length === 0) {
      toast.error('Add at least one size quantity');
      return;
    }
    setSaving(true);
    try {
      const order = await http.post<{ id: string }>('/cut-orders', {
        styleRef: form.styleRef || undefined,
        color: form.color || undefined,
        fabricType: form.fabricType || undefined,
        required,
        notes: form.notes || undefined,
      });
      toast.success('Cut order created');
      router.push(`/cutting/cut-orders/${order.id}`);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to create cut order');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/cutting/cut-orders')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">New Cut Order</h2>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Style reference</Label>
              <Input placeholder="SHIRT-001" value={form.styleRef} onChange={(e) => setForm({ ...form, styleRef: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <Input placeholder="Navy" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Fabric type</Label>
              <Input placeholder="Cotton Poplin" value={form.fabricType} onChange={(e) => setForm({ ...form, fabricType: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Required quantities per size</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => setRows((r) => [...r, { key: `s${Date.now()}`, size: '', qty: '' }])}>
                <Plus /> Add size
              </Button>
            </div>
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.key} className="flex items-center gap-2">
                  <Input
                    className="w-24 text-xs font-semibold uppercase"
                    placeholder="Size"
                    value={row.size}
                    onChange={(e) => setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, size: e.target.value.toUpperCase() } : r)))}
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="Quantity"
                    value={row.qty}
                    onChange={(e) => setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, qty: e.target.value } : r)))}
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))} aria-label="Remove size">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Total garments required</span>
              <span className="font-semibold tabular-nums">{total.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/cutting/cut-orders')}>Cancel</Button>
          <Button type="submit" disabled={saving || total <= 0}>{saving ? 'Creating…' : 'Create cut order'}</Button>
        </div>
      </form>
    </div>
  );
}
