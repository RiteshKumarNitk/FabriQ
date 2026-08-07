'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { list } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/utils';

interface AuditRow {
  id: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  method: string;
  path: string;
  statusCode: number;
  ip?: string;
  createdOn: string;
  user?: { firstName: string; lastName: string; email: string };
}

const ACTIONS = ['CREATE', 'UPDATE', 'ARCHIVE', 'LOGIN', 'LOGOUT', 'UPLOAD', 'DOWNLOAD', 'APPROVE', 'REJECT'];

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (entityType) params.set('entityType', entityType);
      if (action) params.set('action', action);
      // /audit returns a bare array in `data` with meta on the envelope —
      // list() unwraps both correctly.
      const res = await list<AuditRow>(`/audit?${params.toString()}`);
      setRows(res.items);
      setTotal(res.meta.total);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, entityType, action]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Audit Log</h2>
        <p className="text-sm text-muted-foreground">
          Immutable record of every mutating request in your tenant. {total} events.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Entity type (e.g. company)…"
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
          />
        </div>
        <Select className="sm:w-44" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </Select>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                <th className="h-10 px-4">Action</th>
                <th className="h-10 px-4">Actor</th>
                <th className="h-10 px-4">Entity</th>
                <th className="hidden h-10 px-4 md:table-cell">Request</th>
                <th className="h-10 px-4">When</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td colSpan={5} className="px-4 py-2"><Skeleton className="h-8" /></td>
                    </tr>
                  ))
                : rows.length === 0
                  ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">No audit events found</td>
                    </tr>
                  )
                  : rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-accent/40">
                      <td className="px-4 py-2.5">
                        <Badge variant={statusVariant(row.action)}>{row.action}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {row.user ? `${row.user.firstName} ${row.user.lastName}` : <span className="text-muted-foreground">System</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{row.entityType}</span>
                        <span className="ml-1 font-mono text-xs text-muted-foreground">#{row.entityId.slice(0, 8)}</span>
                      </td>
                      <td className="hidden max-w-72 truncate px-4 py-2.5 font-mono text-xs text-muted-foreground md:table-cell">
                        {row.method} {row.path}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDateTime(row.createdOn)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>Page {page} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
