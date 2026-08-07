'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useRefOptions } from '@/components/procurement/use-ref-options';

interface PendingRoll {
  id: string;
  rollNumber: string;
  fabricType?: string | null;
  color?: string | null;
  length?: number | null;
  condition: string;
  grn: { id: string; number: string };
  purchaseOrderItem?: { itemName: string } | null;
}

interface DefectRow {
  defectName: string;
  points: number;
  notes?: string;
}

const POINT_OPTIONS = [1, 2, 3, 4];

export default function InspectionFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rollParam = searchParams.get('roll');

  const inspectors = useRefOptions('/users');
  const [pendingRolls, setPendingRolls] = useState<PendingRoll[]>([]);
  const [rollId, setRollId] = useState(rollParam ?? '');
  const [inspectorId, setInspectorId] = useState('');
  const [inspectionDate, setInspectionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [override, setOverride] = useState('');
  const [defects, setDefects] = useState<DefectRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    http
      .get<PendingRoll[]>('/inspections/pending-rolls')
      .then((rows) => {
        setPendingRolls(rows);
        if (!rollParam && rows.length === 1) setRollId(rows[0].id);
      })
      .catch(() => setPendingRolls([]));
  }, [rollParam]);

  const totalPoints = defects.reduce((s, d) => s + d.points, 0);
  const roll = pendingRolls.find((r) => r.id === rollId);
  const meters = Math.max(Number(roll?.length ?? 0) || 1, 1);
  const pointsPer100m = Math.round((totalPoints / meters) * 10000) / 100;
  const score = Math.max(0, Math.min(100, Math.round((100 - pointsPer100m) * 100) / 100));
  const autoDecision = pointsPer100m <= 15 ? 'APPROVED' : pointsPer100m <= 30 ? 'SECOND_QUALITY' : 'REJECTED';
  const decision = override || autoDecision;

  const submit = useCallback(async () => {
    if (!rollId) {
      toast.error('Select the roll to inspect');
      return;
    }
    setSubmitting(true);
    try {
      const doc = await http.post<{ id: string }>('/inspections', {
        grnRollId: rollId,
        inspectorId: inspectorId || undefined,
        inspectionDate: inspectionDate ? new Date(inspectionDate).toISOString() : undefined,
        remarks: remarks || undefined,
        decision: override || undefined,
        defects: defects.map((d) => ({ defectName: d.defectName.trim(), points: d.points, notes: d.notes?.trim() || undefined })),
      });
      toast.success('Inspection recorded');
      router.push(`/procurement/inspections/${doc.id}`);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to save inspection');
    } finally {
      setSubmitting(false);
    }
  }, [rollId, inspectorId, inspectionDate, remarks, override, defects, router]);

  function updateDefect(i: number, patch: Partial<DefectRow>) {
    setDefects(defects.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/procurement/inspections')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">New Fabric Inspection</h2>
          <p className="text-sm text-muted-foreground">Score each defect 1–4 points; the system grades the roll per the 4-point system.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Roll & Inspector</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="roll">Roll *</Label>
            <Select id="roll" value={rollId} onChange={(e) => setRollId(e.target.value)}>
              <option value="">Select a pending roll…</option>
              {pendingRolls.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.rollNumber} · GRN {r.grn.number} {r.fabricType ? `· ${r.fabricType}` : ''}
                </option>
              ))}
            </Select>
            {roll ? (
              <p className="text-xs text-muted-foreground">
                {roll.purchaseOrderItem?.itemName ?? roll.fabricType ?? '—'} · {roll.color ?? '—'} · {roll.length ? `${roll.length} m` : 'length n/a'} · condition {roll.condition}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inspector">Inspector</Label>
            <Select id="inspector" value={inspectorId} onChange={(e) => setInspectorId(e.target.value)}>
              <option value="">Current user</option>
              {inspectors.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inspectionDate">Inspection Date</Label>
            <Input id="inspectionDate" type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Input id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="override">Decision override (optional)</Label>
            <Select id="override" value={override} onChange={(e) => setOverride(e.target.value)}>
              <option value="">Auto ({autoDecision})</option>
              <option value="APPROVED">Approved</option>
              <option value="SECOND_QUALITY">Second Quality</option>
              <option value="REJECTED">Rejected</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Defects ({defects.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {defects.length === 0 ? (
            <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              No defects recorded — a clean roll grades 100 and is approved.
            </p>
          ) : (
            <div className="space-y-2">
              {defects.map((d, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-44 flex-1 space-y-1">
                    <Label className="text-xs">Defect</Label>
                    <Input value={d.defectName} placeholder="e.g. Hole, Stain, Slub, Broken pick" onChange={(e) => updateDefect(i, { defectName: e.target.value })} />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs">Points (1–4)</Label>
                    <Select value={String(d.points)} onChange={(e) => updateDefect(i, { points: Number(e.target.value) })}>
                      {POINT_OPTIONS.map((p) => <option key={p} value={p}>{p} pt</option>)}
                    </Select>
                  </div>
                  <div className="min-w-40 flex-1 space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Input value={d.notes ?? ''} onChange={(e) => updateDefect(i, { notes: e.target.value })} />
                  </div>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => setDefects(defects.filter((_, idx) => idx !== i))} aria-label="Remove defect">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setDefects([...defects, { defectName: '', points: 1 }])}>
            <Plus /> Add defect
          </Button>
        </CardContent>
      </Card>

      {/* live grade */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <Grade label="Total points" value={String(totalPoints)} />
          <Grade label="Points / 100 m" value={pointsPer100m.toFixed(1)} />
          <Grade label="Quality score" value={`${score.toFixed(1)}%`} />
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Decision</div>
            <div className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${decision === 'APPROVED' ? 'border-transparent bg-emerald-500/10 text-emerald-600' : decision === 'SECOND_QUALITY' ? 'border-transparent bg-amber-500/10 text-amber-600' : 'border-transparent bg-destructive/10 text-destructive'}`}>
              {decision.replace(/_/g, ' ')}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href="/procurement/inspections">Cancel</Link>
        </Button>
        <Button onClick={() => void submit()} disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <Save />}
          Record inspection
        </Button>
      </div>
    </div>
  );
}

function Grade({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
