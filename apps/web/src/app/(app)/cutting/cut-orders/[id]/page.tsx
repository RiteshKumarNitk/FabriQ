'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calculator, CheckCircle2, Play, Plus, Scissors, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { CutOrderStatus, LayPlanStatus, LengthUnit, fromBase } from '@fabriq/shared';
import { http } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { fmtLength } from '@/lib/units';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/cutting/ui';
import { ActivityPanel } from '@/components/procurement/activity-panel';

interface CutOrderDetail {
  id: string;
  number: string;
  status: CutOrderStatus;
  styleRef?: string | null;
  color?: string | null;
  fabricType?: string | null;
  requiredJson: Record<string, number>;
  notes?: string | null;
  fulfillment: Record<string, { required: number; planned: number; actual: number; short: number; excess: number }>;
  layPlans: Array<{
    id: string;
    number: string;
    status: LayPlanStatus;
    ply: number;
    garmentsPerMarker: number;
    markerLengthCm: number;
    markerStartCm: number;
    theoreticalPieces: number;
    marker: { id: string; number: string; efficiencyPct: number; styleRef?: string | null };
    roll: { id: string; number: string };
    remnant?: { id: string; number: string } | null;
    cutOperations: Array<{ id: string; number: string; status: string; actualPieces?: number | null; actualLengthCm?: number | null; wasteLengthCm?: number | null; performedOn?: string | null }>;
  }>;
}

interface RollOption { id: string; number: string; fabricType?: string | null; color?: string | null; usableWidthCm: number; remainingLengthCm: number }
interface MarkerOption { id: string; number: string; styleRef?: string | null; widthCm: number; lengthCm: number; garmentsPerMarker: number; efficiencyPct: number; status: string }
interface RemnantOption { id: string; number: string; lengthCm: number; usableWidthCm: number; sourceRollId: string; status: string }

export default function CutOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<CutOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // lay planning form
  const [markerId, setMarkerId] = useState('');
  const [rollId, setRollId] = useState('');
  const [remnantId, setRemnantId] = useState('');
  const [ply, setPly] = useState('40');
  const [allowDefect, setAllowDefect] = useState(false);
  const [creatingLay, setCreatingLay] = useState(false);
  const [rollOptions, setRollOptions] = useState<RollOption[]>([]);
  const [markerOptions, setMarkerOptions] = useState<MarkerOption[]>([]);
  const [remnantOptions, setRemnantOptions] = useState<RemnantOption[]>([]);

  // cutting form
  const [cutLay, setCutLay] = useState<{ id: string; number: string } | null>(null);
  const [actualLength, setActualLength] = useState('');
  const [actualPieces, setActualPieces] = useState('');
  const [waste, setWaste] = useState('0');
  const [rejected, setRejected] = useState('0');

  const load = useCallback(async () => {
    try {
      const data = await http.get<CutOrderDetail>(`/cut-orders/${params.id}`);
      setOrder(data);
    } catch (e) {
      toast.error((e as Error).message ?? 'Cut order not found');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Options for lay creation. The rolls/markers list endpoints return the
  // plain array envelope ({ data: [...] }) — unwrap defensively.
  useEffect(() => {
    void (async () => {
      try {
        const [rolls, markers, remnants] = await Promise.all([
          http.get<RollOption[] | { items: RollOption[] }>('/fabric-rolls?pageSize=100&status=IN_STOCK'),
          http.get<MarkerOption[] | { items: MarkerOption[] }>('/markers?pageSize=100&status=FINALIZED'),
          http.get<RemnantOption[] | { items: RemnantOption[] }>('/remnants?pageSize=100&status=AVAILABLE'),
        ]);
        const unwrap = <T,>(v: T[] | { items: T[] } | null | undefined): T[] =>
          Array.isArray(v) ? v : (v?.items ?? []);
        setRollOptions(unwrap(rolls));
        setMarkerOptions(unwrap(markers));
        setRemnantOptions(unwrap(remnants));
      } catch {
        /* pickers stay empty; the API will still validate */
      }
    })();
  }, []);

  const totals = useMemo(() => {
    if (!order) return { required: 0, planned: 0, actual: 0, short: 0, excess: 0 };
    let required = 0, planned = 0, actual = 0, short = 0, excess = 0;
    for (const f of Object.values(order.fulfillment)) {
      required += f.required; planned += f.planned; actual += f.actual; short += f.short; excess += f.excess;
    }
    return { required, planned, actual, short, excess };
  }, [order]);

  const selectedMarker = markerOptions.find((m) => m.id === markerId);
  const theoretical = selectedMarker ? selectedMarker.garmentsPerMarker * (Number(ply) || 0) : 0;
  const fabricNeeded = selectedMarker ? selectedMarker.lengthCm : 0; // single-ply — ply is layers, not length

  async function createLay(e: React.FormEvent) {
    e.preventDefault();
    if (!markerId || !rollId || (Number(ply) || 0) <= 0) return;
    setCreatingLay(true);
    try {
      await http.post('/lay-plans', {
        cutOrderId: params.id,
        markerId,
        rollId,
        remnantId: remnantId || undefined,
        ply: Number(ply),
        allowDefectOverlap: allowDefect || undefined,
      });
      toast.success('Lay planned — fabric reserved on the roll');
      setMarkerId(''); setRollId(''); setRemnantId(''); setPly('40'); setAllowDefect(false);
      await load();
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to create lay plan');
    } finally {
      setCreatingLay(false);
    }
  }

  async function completeCutting(e: React.FormEvent) {
    e.preventDefault();
    if (!cutLay) return;
    try {
      await http.post(`/lay-plans/${cutLay.id}/complete-cutting`, {
        actualLengthCm: Number(actualLength),
        actualPieces: Number(actualPieces),
        wasteLengthCm: Number(waste) || 0,
        rejectedPieces: Number(rejected) || 0,
      });
      toast.success('Cutting recorded — roll ledger updated');
      setCutLay(null); setActualLength(''); setActualPieces(''); setWaste('0'); setRejected('0');
      await load();
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to record cutting');
    }
  }

  async function approve() {
    try {
      await http.post(`/cut-orders/${params.id}/approve`);
      toast.success('Cut order approved');
      await load();
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to approve');
    }
  }

  if (loading || !order) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const lu = LengthUnit.METERS;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/cutting/cut-orders')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Cut Order</h2>
            <span className="font-mono text-sm text-muted-foreground">{order.number}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{order.status.replace(/_/g, ' ')}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {[order.styleRef, order.color, order.fabricType].filter(Boolean).join(' · ') || 'No style details'}
          </p>
        </div>
        {order.status === CutOrderStatus.DRAFT ? (
          <Button size="sm" onClick={approve}><CheckCircle2 /> Approve</Button>
        ) : null}
        <Button variant="outline" size="sm" asChild>
          <Link href="/cutting/plan-calculator"><Calculator /> Plan Calculator</Link>
        </Button>
      </div>

      {/* Fulfillment */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Required" value={totals.required.toLocaleString()} />
        <StatTile label="Planned" value={totals.planned.toLocaleString()} hint="Σ size ratio × ply" />
        <StatTile label="Actual cut" value={totals.actual.toLocaleString()} tone="good" />
        <StatTile label="Short" value={totals.short.toLocaleString()} tone={totals.short > 0 ? 'warn' : 'default'} />
        <StatTile label="Excess" value={totals.excess.toLocaleString()} tone={totals.excess > 0 ? 'warn' : 'default'} />
      </div>

      <Card className="p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">Fulfillment by size</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Size</th>
                <th className="px-4 py-2.5 font-medium">Required</th>
                <th className="px-4 py-2.5 font-medium">Planned</th>
                <th className="px-4 py-2.5 font-medium">Actual</th>
                <th className="px-4 py-2.5 font-medium">Short</th>
                <th className="px-4 py-2.5 font-medium">Excess</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(order.fulfillment).map(([size, f]) => (
                <tr key={size} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium">{size}</td>
                  <td className="px-4 py-2.5 tabular-nums">{f.required.toLocaleString()}</td>
                  <td className="px-4 py-2.5 tabular-nums">{f.planned.toLocaleString()}</td>
                  <td className="px-4 py-2.5 tabular-nums">{f.actual.toLocaleString()}</td>
                  <td className={cn('px-4 py-2.5 tabular-nums', f.short > 0 && 'text-amber-600')}>{f.short.toLocaleString()}</td>
                  <td className={cn('px-4 py-2.5 tabular-nums', f.excess > 0 && 'text-amber-600')}>{f.excess.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Lay plans */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Lay plans</h3>
          <span className="text-xs text-muted-foreground">Marker × ply — output = garments/marker × ply</span>
        </div>
        <div className="divide-y">
          {order.layPlans.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No lays planned yet.</p>
          ) : (
            order.layPlans.map((lay) => {
              const op = lay.cutOperations.find((o) => o.status === 'COMPLETED');
              return (
                <div key={lay.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <Link href={`/cutting/lay-plans/${lay.id}`} className="font-mono font-medium underline-offset-2 hover:underline">{lay.number}</Link>
                  <Link href={`/cutting/markers/${lay.marker.id}`} className="text-muted-foreground underline-offset-2 hover:underline">{lay.marker.number}</Link>
                  <span className="text-xs text-muted-foreground">
                    {fmtLength(lay.markerLengthCm, lu)} · {lay.ply} ply · {lay.garmentsPerMarker}/layer
                  </span>
                  {lay.remnant ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800" title="Cut from a remnant">
                      ⌗ {lay.remnant.number}
                    </span>
                  ) : null}
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                    {lay.status.replace(/_/g, ' ')}
                  </span>
                  <span className="tabular-nums text-muted-foreground">Theoretical {lay.theoreticalPieces}</span>
                  {op ? (
                    <span className="tabular-nums text-xs text-emerald-600">
                      Cut {op.actualPieces} pcs · {fmtLength(Number(op.actualLengthCm ?? 0), lu)} used
                      {Number(op.wasteLengthCm ?? 0) > 0 ? ` · ${fmtLength(Number(op.wasteLengthCm), lu)} waste` : ''}
                    </span>
                  ) : null}
                  <div className="ml-auto flex gap-2">
                    {lay.status === LayPlanStatus.PLANNED || lay.status === LayPlanStatus.IN_PROGRESS ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setCutLay({ id: lay.id, number: lay.number })}>
                          <Scissors /> Record cutting
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={async () => {
                            try {
                              await http.post(`/lay-plans/${lay.id}/cancel`);
                              toast.success('Lay cancelled — reservation released');
                              await load();
                            } catch (err) {
                              toast.error((err as Error).message);
                            }
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Plan a lay */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4" /> Plan a lay</h3>
          <form onSubmit={createLay} className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1.5">
              <Label>Finalized marker</Label>
              <Select value={markerId} onChange={(e) => setMarkerId(e.target.value)} required>
                <option value="">Select marker…</option>
                {markerOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.number} · {m.garmentsPerMarker}/mk · {(m.lengthCm / 100).toFixed(2)} m
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fabric roll</Label>
              <Select value={rollId} onChange={(e) => setRollId(e.target.value)} required>
                <option value="">Select roll…</option>
                {rollOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.number} · {(r.remainingLengthCm / 100).toFixed(1)} m · usable {fromBase(r.usableWidthCm, LengthUnit.INCHES).toFixed(1)}"
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                From remnant <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Select value={remnantId} onChange={(e) => setRemnantId(e.target.value)}>
                <option value="">Main roll fabric</option>
                {remnantOptions
                  .filter((rm) => rm.sourceRollId === rollId)
                  .map((rm) => (
                    <option key={rm.id} value={rm.id}>
                      {rm.number} · {(rm.lengthCm / 100).toFixed(2)} m · usable {fromBase(rm.usableWidthCm, LengthUnit.INCHES).toFixed(1)}"
                    </option>
                  ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ply (layers)</Label>
              <Input type="number" min={1} step={1} required value={ply} onChange={(e) => setPly(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={!markerId || !rollId || creatingLay || (order.status !== CutOrderStatus.APPROVED && order.status !== CutOrderStatus.IN_PROGRESS)}>
                {creatingLay ? 'Planning…' : 'Reserve fabric'}
              </Button>
            </div>
          </form>
          {selectedMarker && Number(ply) > 0 ? (
            <div className="grid grid-cols-2 gap-3 border-t pt-3 md:grid-cols-4">
              <StatTile label="Garments / layer" value={String(selectedMarker.garmentsPerMarker)} />
              <StatTile label="Ply" value={ply} />
              <StatTile label="Theoretical output" value={theoretical.toLocaleString()} tone="good" />
              <StatTile label="Fabric / lay" value={fmtLength(fabricNeeded, lu)} hint="single-ply length — ply does not multiply fabric" />
            </div>
          ) : null}
          {(order.status === CutOrderStatus.DRAFT) ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-600"><TriangleAlert className="h-3.5 w-3.5" /> Approve the cut order before planning lays.</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Record cutting dialog (inline) */}
      {cutLay ? (
        <Card className="border-primary">
          <CardContent className="space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Play className="h-4 w-4" /> Record cutting — lay {cutLay.number}</h3>
            <form onSubmit={completeCutting} className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1.5">
                <Label>Actual fabric used (cm)</Label>
                <Input type="number" min={0} step="0.01" required value={actualLength} onChange={(e) => setActualLength(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Actual garment sets cut</Label>
                <Input type="number" min={0} step={1} required value={actualPieces} onChange={(e) => setActualPieces(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Waste length (cm)</Label>
                <Input type="number" min={0} step="0.01" value={waste} onChange={(e) => setWaste(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Rejected pieces</Label>
                <Input type="number" min={0} step={1} value={rejected} onChange={(e) => setRejected(e.target.value)} />
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" className="flex-1" disabled={!actualLength || !actualPieces}>Complete</Button>
                <Button type="button" variant="outline" onClick={() => setCutLay(null)}>Cancel</Button>
              </div>
            </form>
            <p className="text-xs text-muted-foreground">
              Completing writes CONSUMED (and WASTE) rows to the roll's material ledger and reduces the roll's remaining fabric.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <ActivityPanel entityType="cut-orders" entityId={order.id} />
    </div>
  );
}
