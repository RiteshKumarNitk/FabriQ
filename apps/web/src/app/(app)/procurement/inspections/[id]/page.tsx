'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api';
import { cn, formatDate, num } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PStatus } from '@/components/procurement/status-badge';
import { ActivityPanel } from '@/components/procurement/activity-panel';

interface Inspection {
  id: string;
  number: string;
  inspectionDate: string;
  decision: string;
  totalPoints: number;
  pointsPer100m?: number | null;
  qualityScore: number;
  remarks?: string | null;
  inspector?: { firstName?: string; lastName?: string } | null;
  grnRoll: {
    id: string;
    rollNumber: string;
    fabricType?: string | null;
    color?: string | null;
    gsm?: number | null;
    width?: number | null;
    length?: number | null;
    condition: string;
    grn: { id: string; number: string };
    purchaseOrderItem?: { itemName: string } | null;
  };
  defects: Array<{ id: string; defectName: string; points: number; notes?: string | null }>;
}

export default function InspectionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setDoc(await http.get<Inspection>(`/inspections/${params.id}`));
    } catch (e) {
      toast.error((e as Error).message ?? 'Inspection not found');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !doc) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/procurement/inspections')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Fabric Inspection</h2>
            <span className="font-mono text-sm text-muted-foreground">{doc.number}</span>
            <PStatus value={doc.decision} />
          </div>
          <p className="text-xs text-muted-foreground">
            Roll <span className="font-mono">{doc.grnRoll.rollNumber}</span> · GRN{' '}
            <Link className="underline" href={`/procurement/goods-receipts/${doc.grnRoll.grn.id}`}>{doc.grnRoll.grn.number}</Link> · {formatDate(doc.inspectionDate)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Points</div>
            <div className="mt-1 text-xl font-semibold">{doc.totalPoints}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Points / 100 m</div>
            <div className="mt-1 text-xl font-semibold">{num(doc.pointsPer100m).toFixed(1)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quality Score</div>
            <div className="mt-1 text-xl font-semibold text-primary">{num(doc.qualityScore).toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Inspector</div>
            <div className="mt-1 text-sm font-medium">
              {doc.inspector ? `${doc.inspector.firstName} ${doc.inspector.lastName}`.trim() : '—'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Defect</th>
                <th className="px-4 py-2.5 font-medium">Points</th>
                <th className="px-4 py-2.5 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {doc.defects.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">Clean roll — no defects recorded.</td>
                </tr>
              ) : (
                doc.defects.map((d, i) => (
                  <tr key={d.id} className={cn('border-b last:border-0', i % 2 && 'bg-muted/20')}>
                    <td className="px-4 py-2.5 font-medium">{d.defectName}</td>
                    <td className="px-4 py-2.5"><span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{d.points}</span></td>
                    <td className="px-4 py-2.5 text-muted-foreground">{d.notes ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Roll</div>
          <div className="mt-1 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><span className="text-muted-foreground">Fabric: </span>{doc.grnRoll.fabricType ?? '—'}</div>
            <div><span className="text-muted-foreground">Color: </span>{doc.grnRoll.color ?? '—'}</div>
            <div><span className="text-muted-foreground">GSM: </span>{doc.grnRoll.gsm ?? '—'}</div>
            <div><span className="text-muted-foreground">Length: </span>{doc.grnRoll.length ? `${doc.grnRoll.length} m` : '—'}</div>
            <div className="sm:col-span-4"><span className="text-muted-foreground">Item: </span>{doc.grnRoll.purchaseOrderItem?.itemName ?? '—'}</div>
          </div>
          {doc.remarks ? <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{doc.remarks}</p> : null}
        </CardContent>
      </Card>

      <ActivityPanel entityType="inspections" entityId={doc.id} />
    </div>
  );
}
