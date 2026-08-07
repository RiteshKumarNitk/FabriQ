'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { http, list } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, titleCase } from '@/lib/utils';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  isRead: boolean;
  createdOn: string;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      // /notifications returns a bare array in `data` — list() unwraps it.
      const res = await list<NotificationRow>('/notifications?pageSize=100');
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  async function markRead(id: string) {
    try {
      await http.patch(`/notifications/${id}/read`);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch {
      /* ignore */
    }
  }

  async function markAllRead() {
    try {
      await http.post('/notifications/read-all');
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success('All notifications marked as read');
    } catch {
      /* ignore */
    }
  }

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="text-sm text-muted-foreground">{unread} unread</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void markAllRead()} disabled={unread === 0}>
          <CheckCheck /> Mark all read
        </Button>
      </div>

      <Card className="p-0">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="mx-4 my-3 h-12" />)
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <Bell className="h-8 w-8" />
            <p className="text-sm">You're all caught up</p>
          </div>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              onClick={() => void markRead(n.id)}
              className="flex w-full items-start gap-3 border-b px-5 py-3 text-left transition-colors last:border-0 hover:bg-accent/40"
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.isRead ? 'bg-muted' : 'bg-primary'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{n.title}</span>
                  <Badge variant={statusVariant(n.type)} className="text-[10px]">
                    {titleCase(n.type)}
                  </Badge>
                </div>
                {n.body ? <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground/70">{formatDateTime(n.createdOn)}</p>
              </div>
            </button>
          ))
        )}
      </Card>
    </div>
  );
}
