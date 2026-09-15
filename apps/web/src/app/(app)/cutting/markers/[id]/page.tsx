'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, History, Save } from 'lucide-react';
import { toast } from 'sonner';
import { GrainDirection, LengthUnit, MarkerStatus, garmentsPerMarker } from '@fabriq/shared';
import { http } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { fmtAreaCm2, fmtLength } from '@/lib/units';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkerCanvas, type CanvasPiece, type CanvasDefect } from '@/components/cutting/marker-canvas';
import { SizeRatioEditor, StatTile } from '@/components/cutting/ui';

interface MarkerDetail {
  id: string;
  number: string;
  version: number;
  status: MarkerStatus;
  styleRef?: string | null;
  fabricType?: string | null;
  color?: string | null;
  sizeRatioJson: Record<string, number>;
  widthCm: number;
  lengthCm: number;
  endAllowanceCm: number;
  patternAreaCm2: number;
  markerAreaCm2: number;
  efficiencyPct: number;
  garmentsPerMarker: number;
  notes?: string | null;
  pieces: Array<{
    id: string;
    name: string;
    size?: string | null;
    xCm: number;
    yCm: number;
    widthCm: number;
    heightCm: number;
    rotationDeg: number;
    grainDirection: string;
    mirrored: boolean;
    color?: string | null;
  }>;
  revisions: Array<{ id: string; revisionNumber: number; note?: string | null; createdOn: string; createdBy?: string | null }>;
  _count?: { layPlans?: number };
}

export default function MarkerEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [marker, setMarker] = useState<MarkerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pieces, setPieces] = useState<CanvasPiece[]>([]);
  const [lengthCm, setLengthCm] = useState(0);
  const [sizeRatio, setSizeRatio] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const data = await http.get<MarkerDetail>(`/markers/${params.id}`);
      setMarker(data);
      setPieces(data.pieces.map((p) => ({ ...p })));
      setLengthCm(Number(data.lengthCm));
      setSizeRatio(data.sizeRatioJson ?? {});
      setDirty(false);
    } catch (e) {
      toast.error((e as Error).message ?? 'Marker not found');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── live planning numbers (same formulas as the server) ─────────────────
  const live = useMemo(() => {
    const widthCm = marker ? Number(marker.widthCm) : 0;
    const markerArea = lengthCm * widthCm;
    const patternArea = pieces.reduce((s, p) => s + p.widthCm * p.heightCm, 0);
    const efficiency = markerArea > 0 ? Math.min(100, (patternArea / markerArea) * 100) : 0;
    return { widthCm, markerArea, patternArea, efficiency, garments: garmentsPerMarker(sizeRatio) };
  }, [marker, pieces, lengthCm, sizeRatio]);

  const defects: CanvasDefect[] = useMemo(() => {
    if (!marker) return [];
    // Defect overlays appear once the marker is planned on a roll — the
    // marker editor keeps its own coordinate space (0..length) and the API
    // finalization checks the roll spans.
    return [];
  }, [marker]);

  const selected = pieces.find((p) => p.id === selectedId) ?? null;

  function updatePieces(next: CanvasPiece[]) {
    setPieces(next);
    setDirty(true);
    // Auto-derive the marker length from the farthest piece + allowance.
    let maxEnd = 0;
    for (const p of next) {
      const rot = ((p.rotationDeg % 360) + 360) % 360;
      const rad = (rot * Math.PI) / 180;
      const bw = p.widthCm * Math.abs(Math.cos(rad)) + p.heightCm * Math.abs(Math.sin(rad));
      const cx = p.xCm + p.widthCm / 2;
      const end = cx + bw / 2;
      if (end > maxEnd) maxEnd = end;
    }
    const derived = Math.ceil(maxEnd + (marker?.endAllowanceCm ?? 0));
    setLengthCm(Math.max(derived, 1));
  }

  function updateSelected(patch: Partial<CanvasPiece>) {
    if (!selected) return;
    updatePieces(pieces.map((p) => (p.id === selectedId ? { ...p, ...patch } : p)));
  }

  async function save(finalize = false) {
    if (!marker) return;
    setSaving(true);
    try {
      // Length is always sent in cm (the canvas' native unit) so the server
      // stores exactly the geometry shown in the editor.
      await http.patch(`/markers/${marker.id}`, {
        sizeRatio,
        length: lengthCm,
        pieces: pieces.map((p) => ({
          name: p.name,
          size: p.size ?? undefined,
          xCm: p.xCm,
          yCm: p.yCm,
          widthCm: p.widthCm,
          heightCm: p.heightCm,
          rotationDeg: p.rotationDeg,
          grainDirection: p.grainDirection as GrainDirection,
          mirrored: p.mirrored,
          color: p.color ?? undefined,
        })),
      });
      if (finalize) {
        await http.post(`/markers/${marker.id}/finalize`, { note: `Finalized from editor` });
      }
      toast.success(finalize ? 'Marker finalized — revision saved' : 'Marker saved');
      await load();
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to save marker');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !marker) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[32rem] w-full" />
      </div>
    );
  }

  const finalized = marker.status === MarkerStatus.FINALIZED;
  const wu = LengthUnit.INCHES;
  const lu = LengthUnit.METERS;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/cutting/markers')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Marker</h2>
            <span className="font-mono text-sm text-muted-foreground">{marker.number}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">v{marker.version}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{marker.status}</span>
            {marker.styleRef ? <span className="text-xs text-muted-foreground">{marker.styleRef}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!finalized ? (
            <>
              <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving || !dirty}>
                <Save /> Save
              </Button>
              <Button size="sm" onClick={() => save(true)} disabled={saving}>
                <CheckCircle2 /> Finalize
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Finalized — locked for editing</span>
          )}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[260px_1fr_280px]">
        {/* Left panel — planning numbers */}
        <div className="space-y-3">
          <Card>
            <CardContent className="space-y-3 p-3">
              <SizeRatioEditor value={sizeRatio} onChange={(v) => { setSizeRatio(v); setDirty(true); }} disabled={finalized} />
              <div className="grid grid-cols-2 gap-2 border-t pt-3">
                <StatTile label="Garments/marker" value={String(live.garments)} />
                <StatTile label="Efficiency" value={`${live.efficiency.toFixed(1)}%`} tone={live.efficiency >= 80 ? 'good' : live.efficiency >= 70 ? 'warn' : 'bad'} />
                <StatTile label="Pattern area" value={fmtAreaCm2(live.patternArea)} />
                <StatTile label="Waste" value={fmtAreaCm2(Math.max(0, live.markerArea - live.patternArea))} />
              </div>
            </CardContent>
          </Card>

          {marker.revisions.length > 0 ? (
            <Card>
              <CardContent className="p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <History className="h-3.5 w-3.5" /> Revisions
                </div>
                <div className="space-y-1">
                  {marker.revisions.slice(0, 6).map((r) => (
                    <div key={r.id} className="text-xs text-muted-foreground">
                      <span className="font-mono font-medium text-foreground">v{r.revisionNumber}</span>{' '}
                      {formatDateTime(r.createdOn)}
                      {r.note ? <span> · {r.note}</span> : null}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Canvas */}
        <div className="min-h-[34rem]">
          <MarkerCanvas
            widthCm={Number(marker.widthCm)}
            lengthCm={lengthCm}
            pieces={pieces}
            defects={defects}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={updatePieces}
            readOnly={finalized}
            lengthUnit={lu}
          />
        </div>

        {/* Right panel — properties */}
        <div className="space-y-3">
          <Card>
            <CardContent className="space-y-3 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {selected ? 'Selected piece' : 'Marker properties'}
              </h3>
              {selected ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Name</Label>
                      <Input className="h-8 text-xs" value={selected.name} disabled={finalized} onChange={(e) => updateSelected({ name: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Size</Label>
                      <Input className="h-8 text-xs" value={selected.size ?? ''} disabled={finalized} onChange={(e) => updateSelected({ size: e.target.value.toUpperCase() })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Width (cm)</Label>
                      <Input className="h-8 text-xs" type="number" min={1} step="0.1" value={selected.widthCm} disabled={finalized} onChange={(e) => updateSelected({ widthCm: Math.max(1, Number(e.target.value) || 0) })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Height (cm)</Label>
                      <Input className="h-8 text-xs" type="number" min={1} step="0.1" value={selected.heightCm} disabled={finalized} onChange={(e) => updateSelected({ heightCm: Math.max(1, Number(e.target.value) || 0) })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">X (cm)</Label>
                      <Input className="h-8 text-xs" type="number" value={selected.xCm} disabled={finalized} onChange={(e) => updateSelected({ xCm: Math.max(0, Number(e.target.value) || 0) })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Y (cm)</Label>
                      <Input className="h-8 text-xs" type="number" value={selected.yCm} disabled={finalized} onChange={(e) => updateSelected({ yCm: Math.max(0, Number(e.target.value) || 0) })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Rotation</Label>
                      <Select className="h-8 text-xs" value={String(selected.rotationDeg)} disabled={finalized} onChange={(e) => updateSelected({ rotationDeg: Number(e.target.value) })}>
                        {[0, 90, 180, 270].map((a) => (
                          <option key={a} value={a}>{a}°</option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Grain</Label>
                      <Select className="h-8 text-xs" value={selected.grainDirection ?? 'VERTICAL'} disabled={finalized} onChange={(e) => updateSelected({ grainDirection: e.target.value })}>
                        {Object.values(GrainDirection).map((g) => (
                          <option key={g} value={g}>{g.toLowerCase()}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="w-full" disabled={finalized} onClick={() => { setSelectedId(null); }}>
                    Deselect
                  </Button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Marker length (cm)</Label>
                      <Input
                        className="h-8 text-xs"
                        type="number"
                        min={1}
                        value={lengthCm}
                        disabled={finalized}
                        onChange={(e) => { setLengthCm(Math.max(1, Number(e.target.value) || 1)); setDirty(true); }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">End allowance</Label>
                      <Input className="h-8 text-xs" value={marker.endAllowanceCm} disabled />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Length auto-derives from the farthest piece + allowance while pieces move. Set it manually to override.
                  </p>
                  <div className="grid grid-cols-2 gap-2 border-t pt-2">
                    <StatTile label="Usable width" value={fmtLength(Number(marker.widthCm), wu)} />
                    <StatTile label="Marker length" value={fmtLength(lengthCm, lu)} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 text-[11px] leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">Placement rules</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>Red outline = piece crosses usable width or marker end, or overlaps another piece.</li>
                <li>Dashed red = piece overlaps a defect span (checked again at finalize).</li>
                <li>Snap = 5 cm grid. Disable snapping in the toolbar for free placement.</li>
                <li>Saving recomputes everything server-side; efficiency shown live is the same formula.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
