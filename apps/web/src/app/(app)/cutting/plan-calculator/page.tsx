'use client';

import { useMemo, useState } from 'react';
import { Calculator, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fabricForLays, fromBase, garmentsPerMarker, laysRequired, LengthUnit, toBase } from '@fabriq/shared';
import { http } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

interface MarkerOption {
  id: string;
  number: string;
  styleRef?: string | null;
  widthCm: string | number;
  lengthCm: string | number;
  sizeRatioJson: Record<string, number>;
  efficiencyPct: string | number;
}

interface Row {
  markerId: string;
  ply: number;
  lays: number | null; // null = auto from required
}

/**
 * Surface plan calculator — PLANNING ONLY. Every figure on this page is an
 * ESTIMATE derived from marker geometry and the entered quantities; nothing
 * here writes to production data (no lays, no reservations, no ledger rows).
 */
export default function PlanCalculatorPage() {
  const [markers, setMarkers] = useState<MarkerOption[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [required, setRequired] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  async function loadFinalizedMarkers() {
    setLoading(true);
    try {
      const res = await http.get<{ items: MarkerOption[]; meta: { total: number } }>('/markers?status=FINALIZED&pageSize=100');
      setMarkers(res.items);
      if (!res.items.length) toast.error('No finalized markers found — finalize a marker first');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const markersById = useMemo(() => new Map(markers.map((m) => [m.id, m])), [markers]);

  const requiredTotal = useMemo(
    () => Object.values(required).reduce((s, v) => s + Math.max(0, Math.floor(v || 0)), 0),
    [required],
  );

  const results = useMemo(() => {
    return rows.map((row) => {
      const marker = markersById.get(row.markerId);
      const gpm = marker ? garmentsPerMarker(marker.sizeRatioJson ?? {}) : 0;
      const markerLengthCm = marker ? Number(marker.lengthCm) : 0;
      const lays = row.lays ?? laysRequired(requiredTotal, gpm, row.ply);
      const output = lays * gpm * row.ply;
      const fabricCm = fabricForLays(lays, markerLengthCm);
      return { row, marker, gpm, lays, output, fabricCm, markerLengthCm };
    });
  }, [rows, markersById, requiredTotal]);

  const plannedTotal = results.reduce((s, r) => s + r.output, 0);
  const fabricTotalCm = results.reduce((s, r) => s + r.fabricCm, 0);
  void toBase;

  function addRow() {
    if (!markers.length) return;
    setRows([...rows, { markerId: markers[0].id, ply: 1, lays: null }]);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Calculator className="h-5 w-5" /> Surface Plan Calculator
        </h2>
        <p className="text-sm text-muted-foreground">
          Planning aid — all figures below are <strong>ESTIMATED / PLANNED</strong> values. Nothing here
          creates lays, reserves fabric or changes production data.
        </p>
      </div>

      {!markers.length ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">Load your finalized markers to start planning.</p>
          <Button className="mt-3" size="sm" onClick={() => void loadFinalizedMarkers()} disabled={loading}>
            {loading ? 'Loading…' : 'Load finalized markers'}
          </Button>
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Required quantity per size (optional — enables auto lay counts)
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(required).map(([size, qty]) => (
                <div key={size} className="flex items-center gap-1">
                  <span className="w-10 text-xs font-medium">{size}</span>
                  <Input
                    className="h-8 w-24"
                    type="number"
                    min={0}
                    value={qty || ''}
                    onChange={(e) =>
                      setRequired({ ...required, [size]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                    }
                  />
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      const next = { ...required };
                      delete next[size];
                      setRequired(next);
                    }}
                    aria-label={`Remove ${size}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <SizeAdder sizes={required} onAdd={(size) => setRequired({ ...required, [size]: 0 })} />
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Marker combinations (size ratio comes from the marker)
              </p>
              <Button size="sm" variant="outline" onClick={addRow}>Add marker</Button>
            </div>
            <div className="space-y-2">
              {results.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No markers added yet.</p>
              ) : (
                results.map(({ row, marker, gpm, lays, output, fabricCm }) => (
                  <div key={`${row.markerId}-${row.ply}`} className="flex flex-wrap items-end gap-2 rounded-md border p-3">
                    <div className="min-w-48 flex-1">
                      <label className="text-xs text-muted-foreground">Marker</label>
                      <Select
                        value={row.markerId}
                        onChange={(e) => {
                          const markerId = e.target.value;
                          setRows(rows.map((r) => (r === row ? { ...r, markerId } : r)));
                        }}
                      >
                        {markers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.number}{m.styleRef ? ` — ${m.styleRef}` : ''}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-muted-foreground">Ply</label>
                      <Input
                        type="number"
                        min={1}
                        value={row.ply || ''}
                        onChange={(e) =>
                          setRows(rows.map((r) => (r === row ? { ...r, ply: Math.max(1, Math.floor(Number(e.target.value) || 1)) } : r)))
                        }
                      />
                    </div>
                    <div className="w-32">
                      <label className="text-xs text-muted-foreground">Lays (blank = auto)</label>
                      <Input
                        type="number"
                        min={0}
                        value={row.lays ?? ''}
                        onChange={(e) =>
                          setRows(
                            rows.map((r) =>
                              r === row
                                ? { ...r, lays: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value) || 0)) }
                                : r,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="min-w-40 flex-1 text-sm">
                      <p className="text-xs text-muted-foreground">ESTIMATED / PLANNED</p>
                      <p>
                        {gpm} garments/marker × {row.ply} ply × {lays} lay(s) = <strong>{output}</strong> pcs ·
                        fabric ≈ <strong>{fromBase(fabricCm, LengthUnit.METERS).toFixed(1)} m</strong>
                        {marker ? ` · marker ${fromBase(Number(marker.lengthCm), LengthUnit.METERS).toFixed(2)} m` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRows(rows.filter((r) => r !== row))}
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          {results.length > 0 ? (
            <Card className="p-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Kpi label="Required (entered)" value={String(requiredTotal)} />
                <Kpi label="Planned output" value={String(plannedTotal)} />
                <Kpi
                  label={plannedTotal < requiredTotal ? 'Short (planned)' : 'Excess (planned)'}
                  value={String(Math.abs(requiredTotal - plannedTotal))}
                />
                <Kpi label="Estimated fabric" value={`${fromBase(fabricTotalCm, LengthUnit.METERS).toFixed(1)} m`} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Estimates only — actual consumption is recorded by completing lays (cutting) on real rolls.
              </p>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function SizeAdder({
  sizes,
  onAdd,
}: {
  sizes: Record<string, number>;
  onAdd: (size: string) => void;
}) {
  const [size, setSize] = useState('');
  return (
    <div className="flex items-center gap-1">
      <Input
        className="h-8 w-20"
        placeholder="Size"
        value={size}
        onChange={(e) => setSize(e.target.value.toUpperCase())}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          if (size && !Object.keys(sizes).includes(size)) {
            onAdd(size);
            setSize('');
          }
        }}
      >
        Add size
      </Button>
    </div>
  );
}
