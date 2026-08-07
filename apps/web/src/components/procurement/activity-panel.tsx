'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, FileText, MessageSquare, Play, Send, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api';
import { cn, formatBytes, formatDateTime, initials } from '@/lib/utils';
import { API_URL } from '@/lib/api';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface AuditRow {
  id: string;
  action: string;
  method: string;
  path: string;
  createdOn: string;
  user?: { firstName: string; lastName: string };
}
interface CommentRow {
  id: string;
  body: string;
  createdOn: string;
  user: { firstName: string; lastName: string };
}
interface DocumentRow {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  uploadedOn: string;
}
interface WorkflowInstanceRow {
  id: string;
  status: string;
  createdOn: string;
  workflow: { name: string; code: string };
  tasks: Array<{ id: string; status: string; comment?: string; step: { name: string; stepOrder: number } }>;
}

type Tab = 'activity' | 'comments' | 'documents' | 'approval';

/** Audit/comments/documents/approval tabs for any procurement entity. */
export function ActivityPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [tab, setTab] = useState<Tab>('activity');
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [instances, setInstances] = useState<WorkflowInstanceRow[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const [a, c, d, w] = await Promise.allSettled([
      http.get<AuditRow[]>(`/audit?entityType=${entityType}&entityId=${entityId}&pageSize=50`),
      http.get<CommentRow[]>(`/comments?entityType=${entityType}&entityId=${entityId}`),
      http.get<DocumentRow[]>(`/documents?entityType=${entityType}&entityId=${entityId}`),
      http.get<WorkflowInstanceRow[]>(`/workflows/instances?entityType=${entityType}&entityId=${entityId}`),
    ]);
    if (a.status === 'fulfilled') setAudit(a.value);
    if (c.status === 'fulfilled') setComments(c.value);
    if (d.status === 'fulfilled') setDocuments(d.value);
    if (w.status === 'fulfilled') setInstances(w.value);
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    try {
      await http.post('/comments', { entityType, entityId, body: commentBody.trim() });
      setCommentBody('');
      toast.success('Comment added');
      void load();
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to add comment');
    }
  }

  async function uploadDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('entityType', entityType);
      form.append('entityId', entityId);
      await http.upload('/documents/upload', form);
      setFile(null);
      toast.success('Document uploaded');
      void load();
    } catch (err) {
      toast.error((err as Error).message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function downloadDocument(doc: DocumentRow) {
    try {
      const res = await fetch(`${API_URL}/documents/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('fabriq_access_token')}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((err as Error).message ?? 'Download failed');
    }
  }

  const tabs: Array<[Tab, string, typeof Activity]> = [
    ['activity', 'Activity', Activity],
    ['comments', `Comments (${comments.length})`, MessageSquare],
    ['documents', `Documents (${documents.length})`, FileText],
    ['approval', `Approval (${instances.length})`, Play],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b">
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'activity' && (
        <Card>
          <CardContent className="space-y-0 p-0">
            {audit.length === 0 ? (
              <Empty text="No activity recorded yet" />
            ) : (
              audit.map((row, i) => (
                <div key={row.id} className={cn('flex gap-3 px-5 py-3', i < audit.length - 1 && 'border-b')}>
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant={statusVariant(row.action)}>{row.action}</Badge>
                      <span className="font-medium">{row.user ? `${row.user.firstName} ${row.user.lastName}` : 'System'}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(row.createdOn)}</span>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{row.method} {row.path}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'comments' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <form onSubmit={addComment} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Textarea placeholder="Add a comment or @mention a colleague…" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} rows={2} />
                </div>
                <Button type="submit" disabled={!commentBody.trim()}>
                  <Send /> Post
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-0 p-0">
              {comments.length === 0 ? (
                <Empty text="No comments yet" />
              ) : (
                comments.map((c, i) => (
                  <div key={c.id} className={cn('flex gap-3 px-5 py-3', i < comments.length - 1 && 'border-b')}>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {initials(c.user.firstName, c.user.lastName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{c.user.firstName} {c.user.lastName}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(c.createdOn)}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'documents' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <form onSubmit={uploadDocument} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </div>
                <Button type="submit" disabled={!file || uploading}>
                  <Upload /> {uploading ? 'Uploading…' : 'Upload'}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-0 p-0">
              {documents.length === 0 ? (
                <Empty text="No documents attached" />
              ) : (
                documents.map((doc, i) => (
                  <div key={doc.id} className={cn('flex items-center gap-3 px-5 py-3', i < documents.length - 1 && 'border-b')}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.category} · {formatBytes(doc.sizeBytes)} · {formatDateTime(doc.uploadedOn)}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void downloadDocument(doc)}>
                      Download
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'approval' && (
        <Card>
          <CardContent className="space-y-0 p-0">
            {instances.length === 0 ? (
              <Empty text="No approval workflow has been started for this document" />
            ) : (
              instances.map((inst, i) => (
                <div key={inst.id} className={cn('px-5 py-4', i < instances.length - 1 && 'border-b')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{inst.workflow.name}</span>
                    <Badge variant={statusVariant(inst.status)}>{inst.status.replace(/_/g, ' ')}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDateTime(inst.createdOn)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-start gap-2">
                    {inst.tasks.map((task, ti) => (
                      <div key={task.id} className="flex items-start gap-2">
                        {ti > 0 ? <span className="mt-3 text-muted-foreground">→</span> : null}
                        <div className="flex flex-col items-start gap-1">
                          <div className="flex items-center gap-1.5">
                            {task.status === 'APPROVED' ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : task.status === 'REJECTED' ? (
                              <XCircle className="h-4 w-4 text-destructive" />
                            ) : (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-amber-400" />
                            )}
                            <span className="text-xs font-medium">{task.step.name}</span>
                          </div>
                          {task.comment ? (
                            <span className="ml-5 text-xs italic text-muted-foreground">“{task.comment}”</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-medium text-muted-foreground">{text}</p>
    </div>
  );
}
