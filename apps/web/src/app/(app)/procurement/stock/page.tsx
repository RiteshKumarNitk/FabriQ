'use client';

import { useCallback, useEffect, useState } from 'react';
import { Package, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api';
import { formatDateTime, qty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PStatus } from '@/components/procurement/status-badge';

interface Balance {
  warehouseId: string;
  itemName: string;
  unit: string;
  quantityIn: number;
  quantityOut: number;
  balance: number;
}

interface Tx {
  id: string;
  number?: string | null;
  transactionType: string;
  itemName: string;
  quantity: number;
  unit: string;
  batch?: string | null;
  lot?: string | null;
  rack?: string | null;
  shelf?: string | null;
  bin?: string | null;
  unitCost?: number | null;
  createdOn: string;
  warehouse?: { code: string; name: string } | null;
}

export default function StockPage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, t] = await Promise.all([
        http.get<Balance[]>('/stock/balances'),
        http.get<Tx[]>('/stock/transactions?pageSize=10'),
      ]);
      setBalances(b);
      setTxs(t);
    } catch (e) {
      toast.error((e as Error).message ?? 'Failed to load stock');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Stock</h2>
          <p className="text-sm text-muted-foreground">
            Phase 2 hand-off ledger — balances derive from the transaction journal. Full inventory management arrives with Phase 3.
          </p>
        </div>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => void load()} aria-label="Refresh">
          <RefreshCw className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-muted-foreground" /> Balances by warehouse & item
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : balances.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No stock yet — receive approved rolls through Warehouse Receipts to post the first transactions.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Item</th>
                    <th className="px-4 py-2.5 font-medium">Warehouse</th>
                    <th className="px-4 py-2.5 text-right font-medium">In</th>
                    <th className="px-4 py-2.5 text-right font-medium">Out</th>
                    <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b, i) => (
                    <tr key={`${b.warehouseId}-${b.itemName}`} className={i % 2 ? 'bg-muted/20' : ''}>
                      <td className="px-4 py-2.5 font-medium">{b.itemName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{b.warehouseId.slice(0, 8)}</td>
                      <td className="px-4 py-2.5 text-right">{qty(b.quantityIn)}</td>
                      <td className="px-4 py-2.5 text-right">{qty(b.quantityOut)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{qty(b.balance)} <span className="text-xs font-normal text-muted-foreground">{b.unit}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Recent transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : txs.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No transactions yet</p>
          ) : (
            txs.map((t, i) => (
              <div key={t.id} className={`flex items-center gap-3 px-4 py-2.5 ${i < txs.length - 1 ? 'border-b' : ''}`}>
                <PStatus value={t.transactionType} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.itemName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.warehouse?.name ?? '—'} · {t.batch ?? '—'}/{t.lot ?? '—'} · {t.rack ?? '—'}/{t.shelf ?? '—'}/{t.bin ?? '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">+{qty(t.quantity)} <span className="text-xs font-normal text-muted-foreground">{t.unit}</span></p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(t.createdOn)}</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
