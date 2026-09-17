'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { GitBranch, Send } from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface PatternSet {
  id: string;
  code: string;
  name: string;
  styleRef?: string | null;
  version: number;
  status: string;
  description?: string | null;
  supersedes?: { id: string; code: string; version: number } | null;
  pieces: Array<{
    id: string;
    name: string;
    size?: string | null;
    widthCm: string | number;
    heightCm: string | number;
    quantity: number;
    seamAllowanceCm: string | number;
    notes?: string | null;
  }>;
  markers: Array<{ id: string; number: string; status: string; efficiencyPct: string | number }>;
}

export default function PatternSetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { has } = useAuth();
  const [set, setSet] = useState<PatternSet | null>(null);
  const [revisions, setRevisions] = useState<Array<{ id: string; code: string; version: number; _count?: { markers?: number } }>>([]);
  const [markers, setMarkers] = useState<Array<{ id: string; number: string; status: string }>>([]);
  const [applyMarkerId, setApplyMarkerId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [data, revs, markerList] = await Promise.all([
        http.get<PatternSet>(`/pattern-sets/${id}`),
        http.get<Array<{ id: string; code: string; version: number; _count?: { markers?: number } }>>(`/pattern-sets/${id}/revisions`),
        http.get<{ items: Array<{ id: string; number: string; status: string }> }>('/markers?pageSize=100&status=DRAFT'),
      ]);
      setSet(data);
      setRevisions(revs);
      setMarkers(markerList.items);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRevision() {
    setBusy(true);
    try {
      const next = await http.post<{ id: string }>(`/pattern-sets/${id}/revisions`, {});
      toast.success('New revision created — update its pieces freely; older versions stay untouched');
      router.push(`/cutting/patterns/${next.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function applyToMarker() {
    if (!applyMarkerId) {
      toast.error('Pick a draft marker first');
      return;
    }
    setBusy(true);
    try {
      await http.post(`/pattern-sets/${id}/apply-to-marker`, { markerId: applyMarkerId });
      toast.success('Pieces applied to the marker — refine the layout on its canvas');
      router.push(`/cutting/markers/${applyMarkerId}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!set) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {set.code} <Badge>v{set.version}</Badge> {set.status === 'INACTIVE' ? <Badge>archived</Badge> : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            {set.name}
            {set.styleRef ? ` · style ${set.styleRef}` : ''}
            {set.supersedes ? ` · supersedes ${set.supersedes.code}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {has('pattern:create') ? (
            <Button variant="outline" size="sm" onClick={() => void createRevision()} disabled={busy}>
              <GitBranch /> New revision (v{set.version + 1})
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pieces ({set.pieces.length})
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2">Piece</th>
                <th className="px-2 py-2">Size</th>
                <th className="px-2 py-2">Width (cm)</th>
                <th className="px-2 py-2">Height (cm)</th>
                <th className="px-2 py-2">Qty</th>
                <th className="px-2 py-2">Seam (cm)</th>
                <th className="px-2 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {set.pieces.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-2 py-2 font-medium">{p.name}</td>
                  <td className="px-2 py-2">{p.size ?? '—'}</td>
                  <td className="px-2 py-2">{Number(p.widthCm)}</td>
                  <td className="px-2 py-2">{Number(p.heightCm)}</td>
                  <td className="px-2 py-2">{p.quantity}</td>
                  <td className="px-2 py-2">{Number(p.seamAllowanceCm)}</td>
                  <td className="px-2 py-2 text-muted-foreground">{p.notes ?? '—'}</td>
                </tr>
              ))}
              {set.pieces.length === 0 ? (
                <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">No pieces yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Revision history — production patterns are never overwritten
        </p>
        <ul className="space-y-1 text-sm">
          {revisions.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <Link href={`/cutting/patterns/${r.id}`} className="font-medium hover:underline">
                {r.code}
              </Link>
              <Badge>v{r.version}</Badge>
              <span className="text-muted-foreground">{r._count?.markers ?? 0} marker(s) use this</span>
              {r.id === set.id ? <span className="text-muted-foreground">— current</span> : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Markers using this set
        </p>
        {set.markers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No markers reference this pattern set yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {set.markers.map((m) => (
              <li key={m.id}>
                <Link href={`/cutting/markers/${m.id}`} className="font-medium hover:underline">{m.number}</Link>
                <span className="text-muted-foreground"> · {m.status} · {Number(m.efficiencyPct).toFixed(1)}% eff</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {has('pattern:update') ? (
        <Card className="p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Apply pieces to a draft marker
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select className="sm:w-72" value={applyMarkerId} onChange={(e) => setApplyMarkerId(e.target.value)}>
              <option value="">Choose a draft marker…</option>
              {markers.map((m) => (
                <option key={m.id} value={m.id}>{m.number}</option>
              ))}
            </Select>
            <Button size="sm" onClick={() => void applyToMarker()} disabled={busy || !applyMarkerId}>
              <Send /> Apply
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Replaces the marker's current pieces with this set's pieces (first-fit placement) — refine on the canvas.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
