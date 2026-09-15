'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { LengthUnit, LayPlanStatus } from '@fabriq/shared';
import { http } from '@/lib/api';
import { fmtLength } from '@/lib/units';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/cutting/ui';

interface LayDetail {
  id: string;
  number: string;
  status: LayPlanStatus;
  ply: number;
  garmentsPerMarker: number;
  markerLengthCm: number;
  markerStartCm: number;
  theoreticalPieces: number;
  fabricPlannedCm: number;
  notes?: string | null;
  marker: {
    id: string;
    number: string;
    styleRef?: string | null;
    efficiencyPct: number;
    widthCm: number;
    sizeRatioJson: Record<string, number>;
  };
  roll: { id: string; number: string; fabricType?: string | null; color?: string | null };
  cutOrder?: { id: string; number: string } | null;
  cutOperations: Array<{
    id: string;
    number: string;
    status: string;
    actualLengthCm?: number | null;
    actualPieces?: number | null;
    rejectedPieces?: number | null;
    wasteLengthCm?: number | null;
    notes?: string | null;
  }>;
}

export default function LayPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [lay, setLay] = useState<LayDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLay(await http.get<LayDetail>(`/lay-plans/${params.id}`));
    } catch (e) {
      toast.error((e as Error).message ?? 'Lay plan not found');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !lay) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const op = lay.cutOperations.find((o) => o.status === 'COMPLETED');
  const ratioEntries = Object.entries(lay.marker.sizeRatioJson ?? {});
  const plannedStart = lay.markerStartCm;
  const plannedEnd = lay.markerStartCm + lay.markerLengthCm;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Lay Plan</h2>
            <span className="font-mono text-sm text-muted-foreground">{lay.number}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{lay.status.replace(/_/g, ' ')}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Marker <Link className="underline" href={`/cutting/markers/${lay.marker.id}`}>{lay.marker.number}</Link>
            {' · '}Roll <Link className="underline" href={`/cutting/rolls/${lay.roll.id}`}>{lay.roll.number}</Link>
            {lay.cutOrder ? (
              <>
                {' · '}Order <Link className="underline" href={`/cutting/cut-orders/${lay.cutOrder.id}`}>{lay.cutOrder.number}</Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Marker length" value={fmtLength(lay.markerLengthCm, LengthUnit.METERS)} />
        <StatTile label="Ply" value={String(lay.ply)} />
        <StatTile label="Garments / layer" value={String(lay.garmentsPerMarker)} />
        <StatTile label="Theoretical output" value={String(lay.theoreticalPieces)} tone="good" />
        <StatTile label="Fabric planned" value={fmtLength(lay.fabricPlannedCm, LengthUnit.METERS)} hint="single-ply" />
        <StatTile
          label="Position on roll"
          value={`${(plannedStart / 100).toFixed(2)}–${(plannedEnd / 100).toFixed(2)} m`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 p-4 text-sm">
            <h3 className="text-sm font-semibold">Size mix (per layer)</h3>
            {ratioEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Marker has no size ratio.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ratioEntries.map(([size, qty]) => (
                  <span key={size} className="rounded bg-muted px-2 py-1 text-xs font-medium">
                    {size} × {qty}
                  </span>
                ))}
              </div>
            )}
            <p className="border-t pt-2 text-xs text-muted-foreground">
              Marker planning efficiency: <span className="font-medium text-foreground">{Number(lay.marker.efficiencyPct).toFixed(1)}%</span> — actual
              utilization also accounts for end loss, defects, waste and rejects.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4 text-sm">
            <h3 className="text-sm font-semibold">Actual cutting</h3>
            {op ? (
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Cut pieces" value={String(op.actualPieces ?? '—')} />
                <StatTile label="Fabric used" value={fmtLength(Number(op.actualLengthCm ?? 0), LengthUnit.METERS)} />
                <StatTile label="Waste" value={fmtLength(Number(op.wasteLengthCm ?? 0), LengthUnit.METERS)} tone={Number(op.wasteLengthCm ?? 0) > 0 ? 'warn' : 'default'} />
                <StatTile label="Rejected" value={String(op.rejectedPieces ?? 0)} tone={Number(op.rejectedPieces ?? 0) > 0 ? 'bad' : 'default'} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Cutting not yet recorded for this lay.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
