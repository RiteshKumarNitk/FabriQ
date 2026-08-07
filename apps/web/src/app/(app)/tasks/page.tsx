'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { http, list } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/utils';

interface TaskRow {
  id: string;
  status: string;
  createdOn: string;
  step: { name: string; stepOrder: number };
  instance: {
    id: string;
    entityType: string;
    entityId: string;
    status: string;
    workflow: { name: string; code: string };
  };
}

export default function TasksPage() {
  const [items, setItems] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

  const fetchItems = useCallback(async () => {
    try {
      // /workflows/tasks returns a bare array in `data` — list() unwraps it.
      const res = await list<TaskRow>('/workflows/tasks?pageSize=100');
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  async function act(taskId: string, action: 'approve' | 'reject') {
    setActing(taskId);
    try {
      await http.post(`/workflows/tasks/${taskId}/action`, {
        action,
        comment: comments[taskId]?.trim() || undefined,
      });
      toast.success(action === 'approve' ? 'Task approved' : 'Task rejected');
      setItems((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      toast.error((err as Error).message ?? 'Action failed');
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">My Approval Tasks</h2>
        <p className="text-sm text-muted-foreground">Items waiting on your decision.</p>
      </div>

      {loading ? (
        Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Check className="h-8 w-8 text-emerald-500" />
          <p className="text-sm">No pending tasks — you're all caught up.</p>
        </Card>
      ) : (
        items.map((task) => (
          <Card key={task.id} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">Step {task.step.stepOrder}: {task.step.name}</Badge>
              <Badge variant="outline">{task.instance.workflow.name}</Badge>
              <span className="text-xs text-muted-foreground">{formatDateTime(task.createdOn)}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="font-mono text-xs text-muted-foreground">#{task.instance.entityId.slice(0, 8)}</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium">{task.instance.entityType.replace(/-/g, ' ')}</span>
              <Badge variant={statusVariant(task.instance.status)}>{task.instance.status.replace(/_/g, ' ')}</Badge>
            </div>
            <div className="mt-3 space-y-2">
              <Textarea
                rows={2}
                placeholder="Optional comment…"
                value={comments[task.id] ?? ''}
                onChange={(e) => setComments((prev) => ({ ...prev, [task.id]: e.target.value }))}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10"
                  disabled={acting === task.id}
                  onClick={() => void act(task.id, 'reject')}
                >
                  <X /> Reject
                </Button>
                <Button disabled={acting === task.id} onClick={() => void act(task.id, 'approve')}>
                  <Check /> Approve
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
