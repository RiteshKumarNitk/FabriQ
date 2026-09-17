'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api';
import { formatDate, money, qty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PStatus } from '@/components/procurement/status-badge';
import { ActivityPanel } from '@/components/procurement/activity-panel';

interface WR {
  id: string;
  number: string;
  rack?: string | null;
  shelf?: string | null;
  bin?: string | null;
  receivedOn: string;
  warehouse: { code: string; name: string; type: string };
  grnRoll: {
    id: string;
    rollNumber: string;
    fabricType?: string | null;
    color?: string | null;
    length?: number | null;
    batch?: string | null;
    lot?: string | null;
    barcode?: string | null;
    status: string;
    grn: { id: string; number: string };
    purchaseOrderItem?: { itemName: string; unit: string; rate: number } | null;
    inspection?: { id: string; decision: string; qualityScore: number } | null;
    fabricRolls?: Array<{ id: string; number: string; status: string }> | null;
  };
}

export default function WarehouseReceiptDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<WR | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setDoc(await http.get<WR>(`/warehouse-receipts/${params.id}`));
    } catch (e) {
      toast.error((e as Error).message ?? 'Warehouse receipt not found');
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
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/procurement/warehouse-receipts')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Warehouse Receipt</h2>
            <span className="font-mono text-sm text-muted-foreground">{doc.number}</span>
            <PStatus value={doc.grnRoll.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Roll <span className="font-mono">{doc.grnRoll.rollNumber}</span> → {doc.warehouse.name} · {formatDate(doc.receivedOn)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Location</div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><span className="text-muted-foreground">Rack: </span>{doc.rack ?? '—'}</div>
              <div><span className="text-muted-foreground">Shelf: </span>{doc.shelf ?? '—'}</div>
              <div><span className="text-muted-foreground">Bin: </span>{doc.bin ?? '—'}</div>
              <div><span className="text-muted-foreground">Type: </span>{doc.warehouse.type.replace(/_/g, ' ')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Roll</div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div><span className="text-muted-foreground">Item: </span>{doc.grnRoll.purchaseOrderItem?.itemName ?? doc.grnRoll.fabricType ?? '—'}</div>
              <div><span className="text-muted-foreground">Color: </span>{doc.grnRoll.color ?? '—'}</div>
              <div><span className="text-muted-foreground">Batch/Lot: </span>{doc.grnRoll.batch ?? '—'} / {doc.grnRoll.lot ?? '—'}</div>
              <div><span className="text-muted-foreground">Barcode: </span>{doc.grnRoll.barcode ?? '—'}</div>
              <div><span className="text-muted-foreground">Grade: </span>
                {doc.grnRoll.inspection ? (
                  <Link className="underline" href={`/procurement/inspections/${doc.grnRoll.inspection.id}`}>
                    {doc.grnRoll.inspection.decision} ({doc.grnRoll.inspection.qualityScore}%)
                  </Link>
                ) : '—'}
              </div>
              <div><span className="text-muted-foreground">Unit cost: </span>{doc.grnRoll.purchaseOrderItem?.rate ? money(doc.grnRoll.purchaseOrderItem.rate) : '—'}</div>
              {doc.grnRoll.fabricRolls?.map((r) => (
                <div key={r.id}>
                  <span className="text-muted-foreground">Cutting roll: </span>
                  <Link className="underline" href={`/cutting/rolls/${r.id}`}>
                    <span className="font-mono">{r.number}</span>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Traceability</th>
                <th className="px-4 py-2.5 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Warehouse Receipt', doc.number],
                ['Goods Receipt Note', doc.grnRoll.grn.number],
                ['Roll Number', doc.grnRoll.rollNumber],
                ['Roll Status', doc.grnRoll.status.replace(/_/g, ' ')],
                ['Fabric', doc.grnRoll.fabricType ?? '—'],
                ['Qty posted to stock', `${qty(doc.grnRoll.length ?? 1)} ${doc.grnRoll.purchaseOrderItem?.unit ?? 'METERS'}`],
              ].map(([label, value], i) => (
                <tr key={label} className={i % 2 ? 'bg-muted/20' : ''}>
                  <td className="px-4 py-2.5 text-muted-foreground">{label}</td>
                  <td className="px-4 py-2.5 font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ActivityPanel entityType="warehouse-receipts" entityId={doc.id} />
    </div>
  );
}
