'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Plus, Ruler, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { DefectSeverity, DefectType, FabricRollStatus, LengthUnit, SegmentType } from '@fabriq/shared';
import { http } from '@/lib/api';
import { cn, formatDateTime, num } from '@/lib/utils';
import { fmtLength } from '@/lib/units';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { RollTimeline, type TimelineSegment } from '@/components/cutting/roll-timeline';
import { StatTile } from '@/components/cutting/ui';
import { ActivityPanel } from '@/components/procurement/activity-panel';

interface RollDetail {
  id: string;
  number: string;
  fabricName?: string | null;
  fabricType?: string | null;
  color?: string | null;
  shadeLot?: string | null;
  supplierRef?: string | null;
  gsm?: number | null;
  originalLengthCm: number;
  remainingLengthCm: number;
  widthCm: number;
  usableWidthCm: number;
  weightKg?: number | null;
  lengthUnit: LengthUnit;
  widthUnit: LengthUnit;
  status: FabricRollStatus;
  minWidthCm?: number | null;
  maxWidthCm?: number | null;
  avgWidthCm?: number | null;
  notes?: string | null;
  measurements: Array<{
    id: string;
    measuredOn: string;
    lengthCm: number;
    beginWidthCm?: number | null;
    middleWidthCm?: number | null;
    endWidthCm?: number | null;
    minWidthCm?: number | null;
    maxWidthCm?: number | null;
    avgWidthCm?: number | null;
    usableWidthCm: number;
    note?: string | null;
    note2?: string | null;
  }>;
  defects: Array<{
    id: string;
    code?: string | null;
    defectType: DefectType;
    startCm: number;
    endCm: number;
    affectedWidthCm: number;
    severity: DefectSeverity;
    status: string;
    notes?: string | null;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    quantityCm: number;
    balanceAfterCm: number;
    refLabel?: string | null;
    note?: string | null;
    createdOn: string;
  }>;
  segments: TimelineSegment[];
  _count?: { layPlans?: number };
}

const DEFECT_TYPES = Object.values(DefectType);
const SEVERITIES = Object.values(DefectSeverity);

export default function RollDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [roll, setRoll] = useState<RollDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSegment, setSelectedSegment] = useState<TimelineSegment | null>(null);

  // measurement form
  const [mLength, setMLength] = useState('');
  const [mBegin, setMBegin] = useState('');
  const [mMiddle, setMMiddle] = useState('');
  const [mEnd, setMEnd] = useState('');
  const [mUsable, setMUsable] = useState('');
  const [mNote, setMNote] = useState('');

  // defect form
  const [dStart, setDStart] = useState('');
  const [dEnd, setDEnd] = useState('');
  const [dWidth, setDWidth] = useState('');
  const [dType, setDType] = useState<DefectType>(DefectType.STAIN);
  const [dSeverity, setDSeverity] = useState<DefectSeverity>(DefectSeverity.MAJOR);
  const [dNotes, setDNotes] = useState('');

  // close-out / remnant form
  const [showClose, setShowClose] = useState(false);
  const [remnantLength, setRemnantLength] = useState('');
  const [remnantLocation, setRemnantLocation] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await http.get<RollDetail>(`/fabric-rolls/${params.id}`);
      setRoll(data);
    } catch (e) {
      toast.error((e as Error).message ?? 'Roll not found');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !roll) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const lu = roll.lengthUnit ?? LengthUnit.METERS;
  const wu = roll.widthUnit ?? LengthUnit.INCHES;
  const defectLen = roll.defects.reduce((s, d) => s + (d.endCm - d.startCm), 0);
  const availableCm = Math.max(0, roll.remainingLengthCm - defectLen);

  async function post(path: string, body: unknown) {
    await http.post(path, body);
    toast.success('Saved');
    await load();
  }

  async function submitCloseRoll(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await http.post<{ remnant: { number: string } }>(`/fabric-rolls/${roll!.id}/close-roll`, {
        ...(remnantLength ? { lengthCm: Number(remnantLength) } : {}),
        location: remnantLocation.trim() || undefined,
      });
      toast.success(`Remnant ${res.remnant.number} created`);
      setShowClose(false);
      setRemnantLength('');
      setRemnantLocation('');
      await load();
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to close the roll');
    }
  }

  async function submitMeasurement(e: React.FormEvent) {
    e.preventDefault();
    try {
      await post(`/fabric-rolls/${roll!.id}/measurements`, {
        length: Number(mLength),
        beginWidth: mBegin ? Number(mBegin) : undefined,
        middleWidth: mMiddle ? Number(mMiddle) : undefined,
        endWidth: mEnd ? Number(mEnd) : undefined,
        usableWidth: Number(mUsable),
        note: mNote || undefined,
      });
      setMLength(''); setMBegin(''); setMMiddle(''); setMEnd(''); setMUsable(''); setMNote('');
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to record measurement');
    }
  }

  async function submitDefect(e: React.FormEvent) {
    e.preventDefault();
    try {
      await post(`/fabric-rolls/${roll!.id}/defects`, {
        defectType: dType,
        startCm: Number(dStart),
        endCm: Number(dEnd),
        affectedWidthCm: dWidth ? Number(dWidth) : 0,
        severity: dSeverity,
        notes: dNotes || undefined,
      });
      setDStart(''); setDEnd(''); setDWidth(''); setDNotes('');
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to record defect');
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/cutting/rolls')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Fabric Roll</h2>
            <span className="font-mono text-sm text-muted-foreground">{roll.number}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{roll.status.replace(/_/g, ' ')}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {[roll.fabricName, roll.fabricType, roll.color, roll.shadeLot ? `Lot ${roll.shadeLot}` : null, roll.gsm ? `${roll.gsm} GSM` : null]
              .filter(Boolean)
              .join(' · ') || 'No fabric details recorded'}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Original" value={fmtLength(roll.originalLengthCm, lu)} />
        <StatTile label="Remaining" value={fmtLength(roll.remainingLengthCm, lu)} hint={`${Math.round((roll.remainingLengthCm / Math.max(roll.originalLengthCm, 1)) * 100)}% of original`} />
        <StatTile label="Nominal width" value={fmtLength(roll.widthCm, wu)} />
        <StatTile label="Usable width" value={fmtLength(roll.usableWidthCm, wu)} hint={`Selvedge ${fmtLength(roll.widthCm - roll.usableWidthCm, wu)}`} />
        <StatTile label="Defects" value={`${roll.defects.length} spans`} hint={fmtLength(defectLen, lu)} tone={defectLen > 0 ? 'bad' : 'default'} />
        <StatTile label="Available" value={fmtLength(availableCm, lu)} hint="remaining − defect spans" tone="good" />
      </div>

      {/* Roll timeline (VIEW A) */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Roll timeline — every span to scale</h3>
          <span className="text-xs text-muted-foreground">Click a span for details</span>
        </div>
        <RollTimeline
          originalLengthCm={roll.originalLengthCm}
          segments={roll.segments}
          lengthUnit={lu}
          selectedId={selectedSegment?.id ?? null}
          onSelect={setSelectedSegment}
        />
        {selectedSegment ? (
          <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-medium">{selectedSegment.type.replace(/_/g, ' ')}</span>
              {selectedSegment.label ? <span className="text-muted-foreground">{selectedSegment.label}</span> : null}
              <span className="tabular-nums text-muted-foreground">
                {fmtLength(selectedSegment.startCm, lu)} → {fmtLength(selectedSegment.endCm, lu)} ·{' '}
                {fmtLength(selectedSegment.endCm - selectedSegment.startCm, lu)}
              </span>
              {selectedSegment.refType === 'lay-plan' && selectedSegment.refId ? (
                <Link className="text-xs underline" href={`/cutting/lay-plans/${selectedSegment.refId}`}>
                  Open lay plan
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>

      {/* Close-out */}
      {roll.status !== FabricRollStatus.CLOSED && roll.status !== FabricRollStatus.CONSUMED ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Close roll / create remnant</h3>
                <p className="text-xs text-muted-foreground">
                  Cut the remaining usable fabric off the roll as a physically separated remnant. The roll's
                  ledger keeps the REMNANT entry and its remaining balance never goes negative.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowClose(!showClose)}>
                {showClose ? 'Cancel' : 'Close roll…'}
              </Button>
            </div>
            {showClose ? (
              <form onSubmit={submitCloseRoll} className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Remnant length ({lu.toLowerCase()}) — blank = all remaining</Label>
                  <Input type="number" min={0} step="0.01" value={remnantLength} onChange={(e) => setRemnantLength(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Storage location</Label>
                  <Input value={remnantLocation} onChange={(e) => setRemnantLocation(e.target.value)} placeholder="Rack / shelf" />
                </div>
                <div className="flex items-end">
                  <Button type="submit" size="sm">Create remnant & close</Button>
                </div>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Measurement */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Ruler className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Record measurement</h3>
            </div>
            <form onSubmit={submitMeasurement} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Length ({lu.toLowerCase()})</Label>
                  <Input type="number" min={0} step="0.01" required value={mLength} onChange={(e) => setMLength(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Usable width ({wu.toLowerCase()}) *</Label>
                  <Input type="number" min={0} step="0.01" required value={mUsable} onChange={(e) => setMUsable(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Beginning width</Label>
                  <Input type="number" min={0} step="0.01" value={mBegin} onChange={(e) => setMBegin(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Middle width</Label>
                  <Input type="number" min={0} step="0.01" value={mMiddle} onChange={(e) => setMMiddle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>End width</Label>
                  <Input type="number" min={0} step="0.01" value={mEnd} onChange={(e) => setMEnd(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Note</Label>
                  <Input value={mNote} onChange={(e) => setMNote(e.target.value)} />
                </div>
              </div>
              {mBegin && mMiddle && mEnd ? (
                <p className="text-xs text-muted-foreground">
                  Min {Math.min(Number(mBegin), Number(mMiddle), Number(mEnd))} · Max{' '}
                  {Math.max(Number(mBegin), Number(mMiddle), Number(mEnd))} · Avg{' '}
                  {((Number(mBegin) + Number(mMiddle) + Number(mEnd)) / 3).toFixed(2)} — you confirm the usable width manually.
                </p>
                ) : null}
              <Button type="submit" size="sm" disabled={!mLength || !mUsable}>Save measurement</Button>
            </form>

            {roll.measurements.length > 0 ? (
              <div className="space-y-1 border-t pt-3">
                {roll.measurements.slice(0, 3).map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span className="font-mono">{formatDateTime(m.measuredOn)}</span>
                    <span>L {fmtLength(m.lengthCm, lu)}</span>
                    <span>Usable {fmtLength(m.usableWidthCm, wu)}</span>
                    {m.minWidthCm != null ? <span>min {fmtLength(m.minWidthCm, wu)}</span> : null}
                    {m.maxWidthCm != null ? <span>max {fmtLength(m.maxWidthCm, wu)}</span> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Defect mapping */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-semibold">Mark defect</h3>
            </div>
            <form onSubmit={submitDefect} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>From (cm)</Label>
                  <Input type="number" min={0} step="0.01" required value={dStart} onChange={(e) => setDStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>To (cm)</Label>
                  <Input type="number" min={0} step="0.01" required value={dEnd} onChange={(e) => setDEnd(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Width (cm)</Label>
                  <Input type="number" min={0} step="0.01" placeholder="0 = full" value={dWidth} onChange={(e) => setDWidth(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={dType} onChange={(e) => setDType(e.target.value as DefectType)}>
                    {DEFECT_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Severity</Label>
                  <Select value={dSeverity} onChange={(e) => setDSeverity(e.target.value as DefectSeverity)}>
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <Input placeholder="Notes" value={dNotes} onChange={(e) => setDNotes(e.target.value)} />
              <Button type="submit" size="sm" disabled={!dStart || !dEnd}>Add defect</Button>
            </form>

            <div className="space-y-1 border-t pt-3">
              {roll.defects.length === 0 ? (
                <p className="text-xs text-muted-foreground">Clean roll — no defects mapped.</p>
              ) : (
                roll.defects.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-x-3 text-xs">
                    <span className="font-mono font-medium">{d.code}</span>
                    <span>{d.defectType.replace(/_/g, ' ')}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmtLength(d.startCm, lu)} → {fmtLength(d.endCm, lu)}
                    </span>
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">{d.severity}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ledger */}
      <Card className="p-0">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Material ledger — never overwritten</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Change</th>
                <th className="px-4 py-2.5 font-medium">Balance</th>
                <th className="px-4 py-2.5 font-medium">Reference</th>
              </tr>
            </thead>
            <tbody>
              {roll.transactions.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No transactions yet.</td></tr>
              ) : (
                roll.transactions.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDateTime(t.createdOn)}</td>
                    <td className="px-4 py-2.5">{t.type.replace(/_/g, ' ')}</td>
                    <td className={cn('px-4 py-2.5 tabular-nums', t.quantityCm < 0 ? 'text-red-600' : t.quantityCm > 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                      {t.quantityCm === 0 ? '—' : `${t.quantityCm > 0 ? '+' : ''}${fmtLength(Math.abs(t.quantityCm), lu)}`}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{fmtLength(t.balanceAfterCm, lu)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{t.refLabel ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ActivityPanel entityType="fabric-rolls" entityId={roll.id} />
    </div>
  );
}
