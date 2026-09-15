'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { LengthUnit } from '@fabriq/shared';
import { http } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const LENGTH_UNITS = [LengthUnit.METERS, LengthUnit.CM, LengthUnit.INCHES, LengthUnit.FEET, LengthUnit.MM];
const WIDTH_UNITS = [LengthUnit.INCHES, LengthUnit.CM, LengthUnit.MM];

export default function NewRollPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    number: '',
    fabricName: '',
    fabricType: '',
    color: '',
    shadeLot: '',
    supplierRef: '',
    gsm: '',
    length: '',
    lengthUnit: LengthUnit.METERS,
    width: '',
    usableWidth: '',
    widthUnit: LengthUnit.INCHES,
    weightKg: '',
    notes: '',
  });

  const width = Number(form.width) || 0;
  const usable = form.usableWidth === '' ? width : Number(form.usableWidth) || 0;
  const usableInvalid = usable > width && width > 0;
  const canSubmit = Number(form.length) > 0 && width > 0 && !usableInvalid;

  function set(patch: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const roll = await http.post<{ id: string }>('/fabric-rolls', {
        ...(form.number ? { number: form.number } : {}),
        fabricName: form.fabricName || undefined,
        fabricType: form.fabricType || undefined,
        color: form.color || undefined,
        shadeLot: form.shadeLot || undefined,
        supplierRef: form.supplierRef || undefined,
        gsm: form.gsm ? Number(form.gsm) : undefined,
        length: Number(form.length),
        lengthUnit: form.lengthUnit,
        width,
        usableWidth: form.usableWidth === '' ? undefined : usable,
        widthUnit: form.widthUnit,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        notes: form.notes || undefined,
      });
      toast.success('Roll created');
      router.push(`/cutting/rolls/${roll.id}`);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to create roll');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/cutting/rolls')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">New Fabric Roll</h2>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="number">Roll number</Label>
              <Input id="number" placeholder="Auto (R-2026-0001)" value={form.number} onChange={(e) => set({ number: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gsm">GSM</Label>
              <Input id="gsm" type="number" min={0} placeholder="e.g. 120" value={form.gsm} onChange={(e) => set({ gsm: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fabricName">Fabric name</Label>
              <Input id="fabricName" placeholder="Cotton Poplin" value={form.fabricName} onChange={(e) => set({ fabricName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fabricType">Fabric type</Label>
              <Input id="fabricType" placeholder="Woven / Knit…" value={form.fabricType} onChange={(e) => set({ fabricType: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color">Color</Label>
              <Input id="color" placeholder="Navy" value={form.color} onChange={(e) => set({ color: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shadeLot">Shade / Lot</Label>
              <Input id="shadeLot" placeholder="L-042" value={form.shadeLot} onChange={(e) => set({ shadeLot: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplierRef">Supplier / lot reference</Label>
              <Input id="supplierRef" placeholder="WeaveCraft — PO 2026-0012" value={form.supplierRef} onChange={(e) => set({ supplierRef: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weightKg">Weight (kg)</Label>
              <Input id="weightKg" type="number" min={0} step="0.001" placeholder="Auto from GSM × area if empty" value={form.weightKg} onChange={(e) => set({ weightKg: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="length">Roll length *</Label>
              <div className="flex gap-2">
                <Input id="length" type="number" min={0} step="0.01" required placeholder="100" value={form.length} onChange={(e) => set({ length: e.target.value })} />
                <Select className="w-28" value={form.lengthUnit} onChange={(e) => set({ lengthUnit: e.target.value as LengthUnit })}>
                  {LENGTH_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="width">Nominal width *</Label>
              <div className="flex gap-2">
                <Input id="width" type="number" min={0} step="0.01" required placeholder="58" value={form.width} onChange={(e) => set({ width: e.target.value })} />
                <Select className="w-28" value={form.widthUnit} onChange={(e) => set({ widthUnit: e.target.value as LengthUnit })}>
                  {WIDTH_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="usableWidth">Usable width</Label>
              <Input
                id="usableWidth"
                type="number"
                min={0}
                step="0.01"
                placeholder={`≤ ${form.width || 'width'} (default = nominal width)`}
                value={form.usableWidth}
                onChange={(e) => set({ usableWidth: e.target.value })}
                aria-invalid={usableInvalid}
              />
              <p className={cn('text-xs', usableInvalid ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                {usableInvalid
                  ? 'Usable width cannot exceed the nominal width.'
                  : 'Fabric inside the selvedge that patterns may occupy. Leave empty to use the full nominal width.'}
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/cutting/rolls">Cancel</Link>
          </Button>
          <Button type="submit" disabled={!canSubmit || saving}>
            {saving ? 'Creating…' : 'Create roll'}
          </Button>
        </div>
      </form>
    </div>
  );
}
