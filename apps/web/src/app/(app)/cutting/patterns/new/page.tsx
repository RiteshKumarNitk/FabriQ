'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface PieceRow {
  name: string;
  size: string;
  widthCm: string;
  heightCm: string;
  quantity: string;
  seamAllowanceCm: string;
  notes: string;
}

const emptyPiece: PieceRow = { name: '', size: '', widthCm: '', heightCm: '', quantity: '1', seamAllowanceCm: '0', notes: '' };

export default function NewPatternSetPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [styleRef, setStyleRef] = useState('');
  const [description, setDescription] = useState('');
  const [pieces, setPieces] = useState<PieceRow[]>([{ ...emptyPiece }]);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!code.trim() || !name.trim()) {
      toast.error('Code and name are required');
      return;
    }
    setSaving(true);
    try {
      const res = await http.post<{ id: string }>('/pattern-sets', {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        styleRef: styleRef.trim() || undefined,
        description: description.trim() || undefined,
        pieces: pieces
          .filter((p) => p.name.trim() && Number(p.widthCm) > 0 && Number(p.heightCm) > 0)
          .map((p) => ({
            name: p.name.trim(),
            size: p.size.trim() || undefined,
            widthCm: Number(p.widthCm),
            heightCm: Number(p.heightCm),
            quantity: Math.max(1, Number(p.quantity) || 1),
            seamAllowanceCm: Number(p.seamAllowanceCm) || 0,
            notes: p.notes.trim() || undefined,
          })),
      });
      toast.success('Pattern set created');
      router.push(`/cutting/patterns/${res.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">New pattern set</h2>
        <p className="text-sm text-muted-foreground">
          A pattern set is a style folder of reusable pieces. Markers copy pieces from it — with their real
          dimensions.
        </p>
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Code (e.g. SHIRT-001)</label>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SHIRT-001" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Classic shirt" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Style ref</label>
          <Input value={styleRef} onChange={(e) => setStyleRef(e.target.value)} placeholder="STYLE-001" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pattern pieces (dimensions in cm)
          </p>
          <Button size="sm" variant="outline" onClick={() => setPieces([...pieces, { ...emptyPiece }])}>
            <Plus /> Add piece
          </Button>
        </div>
        <div className="space-y-2">
          {pieces.map((p, i) => (
            <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-md border p-3 sm:grid-cols-6">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Piece name</label>
                <Input
                  value={p.name}
                  onChange={(e) => setPieces(pieces.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  placeholder="Front / Sleeve / Collar…"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Size</label>
                <Input
                  value={p.size}
                  onChange={(e) => setPieces(pieces.map((x, j) => (j === i ? { ...x, size: e.target.value.toUpperCase() } : x)))}
                  placeholder="M"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Width (cm)</label>
                <Input
                  type="number"
                  min={0}
                  value={p.widthCm}
                  onChange={(e) => setPieces(pieces.map((x, j) => (j === i ? { ...x, widthCm: e.target.value } : x)))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Height (cm)</label>
                <Input
                  type="number"
                  min={0}
                  value={p.heightCm}
                  onChange={(e) => setPieces(pieces.map((x, j) => (j === i ? { ...x, heightCm: e.target.value } : x)))}
                />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <label className="text-xs text-muted-foreground">Qty</label>
                  <Input
                    type="number"
                    min={1}
                    value={p.quantity}
                    onChange={(e) => setPieces(pieces.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Seam cm</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={p.seamAllowanceCm}
                    onChange={(e) =>
                      setPieces(pieces.map((x, j) => (j === i ? { ...x, seamAllowanceCm: e.target.value } : x)))
                    }
                  />
                </div>
              </div>
              <div className="col-span-2 sm:col-span-6 flex items-center justify-between">
                <Input
                  className="max-w-md"
                  value={p.notes}
                  onChange={(e) => setPieces(pieces.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))}
                  placeholder="Notes (matching requirement, grain, …)"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPieces(pieces.filter((_, j) => j !== i))}
                  aria-label="Remove piece"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={() => void submit()} disabled={saving}>
          {saving ? 'Saving…' : 'Create pattern set'}
        </Button>
      </div>
      <Textarea className="hidden" />
    </div>
  );
}
