'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Priority } from '@fabriq/shared';
import { http } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ItemsEditor, type LineItem } from '@/components/procurement/items-editor';
import { useRefOptions } from '@/components/procurement/use-ref-options';

export default function RequisitionFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const users = useRefOptions('/users');
  const departments = useRefOptions('/org-units/departments');

  const [requestDate, setRequestDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [requestedById, setRequestedById] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [priority, setPriority] = useState(Priority.MEDIUM);
  const [expectedDate, setExpectedDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(Boolean(editId));

  useEffect(() => {
    if (!editId) return;
    http
      .get<Record<string, unknown>>(`/requisitions/${editId}`)
      .then((doc) => {
        setRequestDate((doc.requestDate as string)?.slice(0, 10) ?? '');
        setRequestedById((doc.requestedById as string) ?? '');
        setDepartmentId((doc.departmentId as string) ?? '');
        setPriority((doc.priority as Priority) ?? Priority.MEDIUM);
        setExpectedDate((doc.expectedDate as string)?.slice(0, 10) ?? '');
        setRemarks((doc.remarks as string) ?? '');
        setItems(
          ((doc.items as Array<Record<string, unknown>>) ?? []).map((i) => ({
            itemName: String(i.itemName ?? ''),
            description: (i.description as string) ?? '',
            quantity: Number(i.quantity),
            unit: String(i.unit ?? 'METERS'),
            remarks: (i.remarks as string) ?? '',
          })),
        );
      })
      .catch((e) => toast.error((e as Error).message ?? 'Could not load requisition'))
      .finally(() => setLoading(false));
  }, [editId]);

  const submit = useCallback(async () => {
    if (items.length === 0 || items.some((i) => !i.itemName.trim() || !i.quantity || i.quantity <= 0)) {
      toast.error('Add at least one item with a name and a quantity greater than zero');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        requestDate: requestDate ? new Date(requestDate).toISOString() : undefined,
        requestedById: requestedById || undefined,
        departmentId: departmentId || undefined,
        priority,
        expectedDate: expectedDate ? new Date(expectedDate).toISOString() : undefined,
        remarks: remarks || undefined,
        items: items.map(({ itemName, description, quantity, unit, remarks: r }) => ({
          itemName: itemName.trim(),
          description: description?.trim() || undefined,
          quantity,
          unit,
          remarks: r?.trim() || undefined,
        })),
      };
      const doc = editId
        ? await http.patch<{ id: string }>(`/requisitions/${editId}`, payload)
        : await http.post<{ id: string }>('/requisitions', payload);
      toast.success(editId ? 'Requisition updated' : 'Requisition created');
      router.push(`/procurement/requisitions/${doc.id}`);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to save requisition');
    } finally {
      setSubmitting(false);
    }
  }, [editId, requestDate, requestedById, departmentId, priority, expectedDate, remarks, items, router]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/procurement/requisitions')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">{editId ? 'Edit Purchase Requisition' : 'New Purchase Requisition'}</h2>
          <p className="text-sm text-muted-foreground">
            {editId ? 'Update the draft requisition.' : 'Request materials — the document number is assigned automatically.'}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Header</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="requestDate">Request Date</Label>
            <Input id="requestDate" type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="requestedBy">Requested By</Label>
            <Select id="requestedBy" value={requestedById} onChange={(e) => setRequestedById(e.target.value)}>
              <option value="">Current user</option>
              {users.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="department">Department</Label>
            <Select id="department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">—</option>
              {departments.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="priority">Priority</Label>
            <Select id="priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {Object.values(Priority).map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expectedDate">Expected Date</Label>
            <Input id="expectedDate" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="remarks">Remarks</Label>
            <Input id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional note" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Items</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemsEditor items={items} onChange={setItems} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href="/procurement/requisitions">Cancel</Link>
        </Button>
        <Button onClick={() => void submit()} disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <Save />}
          {editId ? 'Save changes' : 'Create requisition'}
        </Button>
      </div>
    </div>
  );
}
