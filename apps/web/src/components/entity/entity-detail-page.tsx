'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  FileText,
  MessageSquare,
  Pencil,
  Play,
  Send,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { type SafeEntityConfig } from '@/lib/entities';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn, displayName, formatBytes, formatDateTime, initials, titleCase } from '@/lib/utils';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface EntityDetailPageProps {
  config: SafeEntityConfig;
  id: string;
}

type Tab = 'activity' | 'comments' | 'documents' | 'workflows';

interface AuditRow {
  id: string;
  action: string;
  module: string;
  entityType: string;
  method: string;
  path: string;
  requestBody?: unknown;
  statusCode: number;
  ip?: string;
  createdOn: string;
  user?: { firstName: string; lastName: string; email: string };
}

interface CommentRow {
  id: string;
  body: string;
  createdOn: string;
  userId: string;
  user: { firstName: string; lastName: string; email: string };
}

interface DocumentRow {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  uploadedOn: string;
  uploadedBy: string | null;
}

interface WorkflowInstanceRow {
  id: string;
  status: string;
  createdOn: string;
  workflow: { name: string; code: string };
  tasks: Array<{ id: string; status: string; comment?: string; step: { name: string; stepOrder: number } }>;
}

export function EntityDetailPage({ config, id }: EntityDetailPageProps) {
  const router = useRouter();
  const { has, user } = useAuth();
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('activity');

  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [instances, setInstances] = useState<WorkflowInstanceRow[]>([]);

  const [commentBody, setCommentBody] = useState('');
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // Must match the audit interceptor's entityType derivation (first path
  // segment after /api/v1), e.g. /org-units/departments → "org-units".
  const entityType = config.apiPath.split('/').filter(Boolean)[0];

  const load = useCallback(async () => {
    try {
      setRecord(await http.get<Record<string, unknown>>(`${config.apiPath}/${id}`));
    } catch (err) {
      toast.error((err as Error).message ?? 'Record not found');
      router.replace(`/admin/${config.key}`);
    } finally {
      setLoading(false);
    }
  }, [config.apiPath, config.key, id, router]);

  const loadTabs = useCallback(async () => {
    const [a, c, d, w] = await Promise.allSettled([
      http.get<AuditRow[]>(`/audit?entityType=${entityType}&entityId=${id}&pageSize=50`),
      http.get<CommentRow[]>(`/comments?entityType=${entityType}&entityId=${id}`),
      http.get<DocumentRow[]>(`/documents?entityType=${entityType}&entityId=${id}`),
      http.get<WorkflowInstanceRow[]>(`/workflows/instances?entityType=${entityType}&entityId=${id}`),
    ]);
    if (a.status === 'fulfilled') setAudit(a.value);
    if (c.status === 'fulfilled') setComments(c.value);
    if (d.status === 'fulfilled') setDocuments(d.value);
    if (w.status === 'fulfilled') setInstances(w.value);
  }, [entityType, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadTabs();
  }, [loadTabs]);

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    try {
      await http.post('/comments', { entityType, entityId: id, body: commentBody.trim() });
      setCommentBody('');
      toast.success('Comment added');
      void loadTabs();
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
      form.append('entityId', id);
      await http.upload('/documents/upload', form);
      setFile(null);
      toast.success('Document uploaded');
      void loadTabs();
    } catch (err) {
      toast.error((err as Error).message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function downloadDocument(doc: DocumentRow) {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/documents/${doc.id}/download`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('fabriq_access_token')}` } },
      );
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

  async function startWorkflow() {
    try {
      await http.post('/workflows/instances', { entityType, entityId: id });
      toast.success('Workflow started');
      void loadTabs();
    } catch (err) {
      toast.error((err as Error).message ?? 'Could not start workflow');
    }
  }

  async function archiveRecord() {
    if (!confirm(`Archive this ${config.label.toLowerCase()}?`)) return;
    try {
      await http.post(`${config.apiPath}/${id}/archive`);
      toast.success(`${config.label} archived`);
      router.push(`/admin/${config.key}`);
    } catch (err) {
      toast.error((err as Error).message ?? 'Archive failed');
    }
  }

  if (loading || !record) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const displayFields = config.fields.filter((f) => f.detail || f.column);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/${config.key}`)} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{displayName(record)}</h2>
            {record.status ? (
              <Badge variant={statusVariant(String(record.status))}>{String(record.status).replace(/_/g, ' ')}</Badge>
            ) : null}
            {record.code ? (
              <Badge variant="outline" className="font-mono">{String(record.code)}</Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {config.label} · {id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {has(config.permissions.update) && config.canEdit !== false ? (
            <Button variant="outline" size="sm" onClick={() => router.push(`/admin/${config.key}?edit=${id}`)}>
              <Pencil /> Edit
            </Button>
          ) : null}
          {has(config.permissions.delete) && config.canArchive !== false ? (
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => void archiveRecord()}>
              <Trash2 /> Archive
            </Button>
          ) : null}
        </div>
      </div>

      {/* overview */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayFields.map((field) => {
              const value = record[field.name];
              if (value === null || value === undefined || value === '') return null;
              return (
                <div key={field.name}>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</div>
                  <div className={cn('mt-0.5 text-sm', field.type === 'json' && 'font-mono text-xs')}>
                    {field.type === 'boolean' ? (
                      <Badge variant={value ? 'success' : 'muted'}>{value ? 'Yes' : 'No'}</Badge>
                    ) : field.type === 'select' || field.name === 'status' ? (
                      <Badge variant={statusVariant(String(value))}>{String(value).replace(/_/g, ' ')}</Badge>
                    ) : typeof value === 'object' ? (
                      <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>
                    ) : (
                      String(value)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* tabs */}
      <div className="flex items-center gap-1 border-b">
        {([
          ['activity', 'Activity', Activity],
          ['comments', `Comments (${comments.length})`, MessageSquare],
          ['documents', `Documents (${documents.length})`, FileText],
          ['workflows', `Workflows (${instances.length})`, Play],
        ] as const).map(([key, label, Icon]) => (
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
              <EmptyState text="No activity recorded yet" />
            ) : (
              audit.map((row, i) => (
                <div key={row.id} className={cn('flex gap-3 px-5 py-3', i < audit.length - 1 && 'border-b')}>
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant={statusVariant(row.action)}>{row.action}</Badge>
                      <span className="font-medium">
                        {row.user ? `${row.user.firstName} ${row.user.lastName}` : 'System'}
                      </span>
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
                  <Textarea
                    placeholder="Add a comment or @mention a colleague…"
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    rows={2}
                  />
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
                <EmptyState text="No comments yet" />
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
                <EmptyState text="No documents attached" />
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

      {tab === 'workflows' && (
        <div className="space-y-4">
          {has('workflow:approve') ? (
            <div className="flex items-center justify-between rounded-lg border bg-card p-4">
              <div>
                <p className="text-sm font-medium">Start an approval workflow</p>
                <p className="text-xs text-muted-foreground">
                  Routes this record through the configured approval steps for “{entityType}”.
                </p>
              </div>
              <Button size="sm" onClick={() => void startWorkflow()}>
                <Play /> Start
              </Button>
            </div>
          ) : null}
          <Card>
            <CardContent className="space-y-0 p-0">
              {instances.length === 0 ? (
                <EmptyState text="No workflow instances for this record" />
              ) : (
                instances.map((inst, i) => (
                  <div key={inst.id} className={cn('px-5 py-4', i < instances.length - 1 && 'border-b')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{inst.workflow.name}</span>
                      <Badge variant={statusVariant(inst.status)}>{inst.status.replace(/_/g, ' ')}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTime(inst.createdOn)}</span>
                    </div>
                    <div className="mt-3 flex items-start gap-2">
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
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-medium text-muted-foreground">{text}</p>
    </div>
  );
}
