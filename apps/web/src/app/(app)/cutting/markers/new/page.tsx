'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { LengthUnit, calculateMarker, deriveMarkerLength, garmentsPerMarker } from '@fabriq/shared';
import { http } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SizeRatioEditor, StatTile } from '@/components/cutting/ui';

interface PieceRow {
  key: string;
  name: string;
  size: string;
  widthCm: string;
  heightCm: string;
  qty: number;
}

export default function NewMarkerPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    styleRef: '',
    fabricType: '',
    color: '',
    width: '',
    widthUnit: LengthUnit.INCHES,
    endAllowance: '0',
    notes: '',
  });
  const [sizeRatio, setSizeRatio] = useState<Record<string, number>>({ M: 2, L: 2, XL: 1 });
  const [pieces, setPieces] = useState<PieceRow[]>([
    { key: 'p1', name: 'Front', size: 'M', widthCm: '55', heightCm: '72', qty: 1 },
    { key: 'p1b', name: 'Front', size: 'L', widthCm: '57', heightCm: '74', qty: 1 },
    { key: 'p2', name: 'Back', size: 'M', widthCm: '55', heightCm: '72', qty: 1 },
    { key: 'p2b', name: 'Back', size: 'L', widthCm: '57', heightCm: '74', qty: 1 },
    { key: 'p3', name: 'Sleeve', size: 'XL', widthCm: '25', heightCm: '60', qty: 2 },
  ]);

  const widthCm = useMemo(() => {
    const v = Number(form.width) || 0;
    return v > 0 ? (form.widthUnit === LengthUnit.INCHES ? v * 2.54 : form.widthUnit === LengthUnit.MM ? v / 10 : form.widthUnit === LengthUnit.FEET ? v * 30.48 : v) : 0;
  }, [form.width, form.widthUnit]);

  // Live preview: expand quantity rows into placed pieces (simple stacked
  // placement down the marker) to estimate the marker length + efficiency.
  const preview = useMemo(() => {
    if (widthCm <= 0) return null;
    const placed: Array<{ width: number; height: number; x: number; y: number }> = [];
    let x = 0;
    let y = 0;
    let rowH = 0;
    for (const row of pieces) {
      const w = Number(row.widthCm) || 0;
      const h = Number(row.heightCm) || 0;
      for (let i = 0; i < row.qty; i++) {
        if (w <= 0 || h <= 0) continue;
        if (x + w > widthCm && x > 0) {
          x = 0;
          y += rowH;
          rowH = 0;
        }
        placed.push({ width: w, height: h, x, y });
        x += w;
        rowH = Math.max(rowH, h);
      }
    }
    const derived = deriveMarkerLength(placed, Number(form.endAllowance) || 0);
    const calc = calculateMarker({ usableWidthCm: widthCm, lengthCm: derived, pieces: placed });
    return { ...calc, garments: garmentsPerMarker(sizeRatio) };
  }, [pieces, widthCm, form.endAllowance, sizeRatio]);

  function updateRow(key: string, patch: Partial<PieceRow>) {
    setPieces((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (widthCm <= 0) return;
    setSaving(true);
    try {
      // Expand qty rows into individual pieces and place them in the same
      // simple stacking used by the preview (the editor can refine later).
      const expanded: Array<{ name: string; size: string; xCm: number; yCm: number; widthCm: number; heightCm: number }> = [];
      let x = 0;
      let y = 0;
      let rowH = 0;
      for (const row of pieces) {
        const w = Number(row.widthCm) || 0;
        const h = Number(row.heightCm) || 0;
        for (let i = 0; i < row.qty; i++) {
          if (w <= 0 || h <= 0) continue;
          if (x + w > widthCm && x > 0) {
            x = 0;
            y += rowH;
            rowH = 0;
          }
          expanded.push({ name: row.name, size: row.size, xCm: x, yCm: y, widthCm: w, heightCm: h });
          x += w;
          rowH = Math.max(rowH, h);
        }
      }
      const marker = await http.post<{ id: string }>('/markers', {
        styleRef: form.styleRef || undefined,
        fabricType: form.fabricType || undefined,
        color: form.color || undefined,
        sizeRatio,
        width: Number(form.width),
        widthUnit: form.widthUnit,
        endAllowance: Number(form.endAllowance) || 0,
        notes: form.notes || undefined,
        pieces: expanded.map((p) => ({ ...p, xCm: p.xCm, yCm: p.yCm })),
      });
      toast.success('Marker created');
      router.push(`/cutting/markers/${marker.id}`);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to create marker');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/cutting/markers')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">New Marker</h2>
      </div>

      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Style reference</Label>
                <Input placeholder="SHIRT-001" value={form.styleRef} onChange={(e) => setForm({ ...form, styleRef: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fabric type</Label>
                <Input placeholder="Cotton Poplin" value={form.fabricType} onChange={(e) => setForm({ ...form, fabricType: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <Input placeholder="Navy" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>End allowance (cm)</Label>
                <Input type="number" min={0} step="0.5" value={form.endAllowance} onChange={(e) => setForm({ ...form, endAllowance: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Usable width *</Label>
                <div className="flex gap-2">
                  <Input type="number" min={0} step="0.01" required placeholder="56.5" value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} />
                  <Select className="w-28" value={form.widthUnit} onChange={(e) => setForm({ ...form, widthUnit: e.target.value as LengthUnit })}>
                    {[LengthUnit.INCHES, LengthUnit.CM, LengthUnit.MM].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea rows={1} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Pattern pieces</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => setPieces((r) => [...r, { key: `p${Date.now()}`, name: '', size: 'M', widthCm: '', heightCm: '', qty: 1 }])}>
                  <Plus /> Add piece
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Size</th>
                      <th className="px-3 py-2 font-medium">Width (cm)</th>
                      <th className="px-3 py-2 font-medium">Height (cm)</th>
                      <th className="px-3 py-2 font-medium">Qty</th>
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {pieces.map((row) => (
                      <tr key={row.key} className="border-b last:border-0">
                        <td className="px-2 py-1.5"><Input className="h-8 text-xs" value={row.name} onChange={(e) => updateRow(row.key, { name: e.target.value })} /></td>
                        <td className="px-2 py-1.5"><Input className="h-8 w-20 text-xs uppercase" value={row.size} onChange={(e) => updateRow(row.key, { size: e.target.value.toUpperCase() })} /></td>
                        <td className="px-2 py-1.5"><Input className="h-8 w-24 text-xs" type="number" min={0} step="0.1" value={row.widthCm} onChange={(e) => updateRow(row.key, { widthCm: e.target.value })} /></td>
                        <td className="px-2 py-1.5"><Input className="h-8 w-24 text-xs" type="number" min={0} step="0.1" value={row.heightCm} onChange={(e) => updateRow(row.key, { heightCm: e.target.value })} /></td>
                        <td className="px-2 py-1.5"><Input className="h-8 w-16 text-xs" type="number" min={1} value={row.qty} onChange={(e) => updateRow(row.key, { qty: Math.max(1, Number(e.target.value)) })} /></td>
                        <td className="px-2 py-1.5">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setPieces((r) => r.filter((x) => x.key !== row.key))} aria-label="Remove piece">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Pieces are auto-placed edge-to-edge on creation — open the marker editor to drag, rotate and optimize the layout.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <SizeRatioEditor value={sizeRatio} onChange={setSizeRatio} />
            </CardContent>
          </Card>
          {preview ? (
            <Card>
              <CardContent className="grid grid-cols-2 gap-3 p-4">
                <StatTile label="Derived length" value={`${(preview.lengthCm / 100).toFixed(2)} m`} />
                <StatTile label="Efficiency" value={`${preview.efficiencyPct.toFixed(1)}%`} tone={preview.efficiencyPct >= 80 ? 'good' : preview.efficiencyPct >= 70 ? 'warn' : 'bad'} />
                <StatTile label="Pattern area" value={`${(preview.patternAreaCm2 / 10000).toFixed(2)} m²`} />
                <StatTile label="Garments / marker" value={String(preview.garments)} />
              </CardContent>
            </Card>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/cutting/markers')}>Cancel</Button>
            <Button type="submit" disabled={widthCm <= 0 || saving}>{saving ? 'Creating…' : 'Create marker'}</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
