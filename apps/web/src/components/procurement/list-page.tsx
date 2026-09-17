'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Plus, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { list } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PStatus } from './status-badge';

export interface ListColumn<T = Record<string, unknown>> {
  key: string;
  label: string;
  className?: string;
  /** server supports sortBy=<key> for this column (must be whitelisted server-side) */
  sortable?: boolean;
  /** friendly value renderer; default falls back to the raw value */ 
  render?: (row: T) => React.ReactNode;
}

interface ListPageProps {
  title: string;
  description?: string;
  apiPath: string;
  columns: ListColumn[];
  /** status column name used for the filter dropdown + status badge rendering */
  statusField?: string;
  statusOptions?: Array<{ label: string; value: string }>;
  createHref?: string;
  createLabel?: string;
  /** permission code required to see the create button */
  createPermission?: string;
  searchPlaceholder?: string;
  rowHref?: (row: Record<string, unknown>) => string;
  emptyText?: string;
}

export function ProcurementListPage({
  title,
  description,
  apiPath,
  columns,
  statusField = 'status',
  statusOptions,
  createHref,
  createLabel = 'New',
  createPermission,
  searchPlaceholder,
  rowHref,
  emptyText = 'No records found',
}: ListPageProps) {
  const { has } = useAuth();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      if (status) params.set('filters', JSON.stringify({ [statusField]: status }));
      if (sortBy) {
        params.set('sortBy', sortBy);
        params.set('sortOrder', sortOrder);
      }
      const res = await list<Record<string, unknown>>(`${apiPath}?${params.toString()}`);
      setItems(res.items);
      setTotal(res.meta.total);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [apiPath, page, pageSize, search, status, statusField, sortBy, sortOrder]);

  /** asc → desc → clear */
  function toggleSort(key: string) {
    if (sortBy !== key) {
      setSortBy(key);
      setSortOrder('asc');
    } else if (sortOrder === 'asc') {
      setSortOrder('desc');
    } else {
      setSortBy(null);
      setSortOrder('desc');
    }
    setPage(1);
  }

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  function exportCsv() {
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[\",\n]/.test(s) ? `"${s.replace(/\"/g, '\"\"')}"` : s;
    };
    const rows = items.map((item) => columns.map((c) => esc(item[c.key])));
    const csv = [columns.map((c) => esc(c.label)), ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderCell(column: ListColumn, row: Record<string, unknown>) {
    if (column.render) return column.render(row);
    const value = row[column.key];
    if (column.key === statusField && value !== undefined) return <PStatus value={String(value)} />;
    if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
    if (typeof value === 'object') {
      // _count aggregates and nested refs
      if (column.key === '_count') return null;
      const v = value as Record<string, unknown>;
      if (v.firstName || v.name || v.code) {
        const name = String(v.name ?? `${v.firstName ?? ''} ${v.lastName ?? ''}`.trim());
        return name.trim() || String(v.code ?? '—');
      }
      return JSON.stringify(value).slice(0, 60);
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (column.key.toLowerCase().includes('date') && value) return formatDateTime(value as string);
    return String(value);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={items.length === 0}>
            <Download /> Export CSV
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => void fetchItems()} aria-label="Refresh">
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
          {createHref && (!createPermission || has(createPermission)) ? (
            <Button size="sm" asChild>
              <Link href={createHref}>
                <Plus /> {createLabel}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={searchPlaceholder ?? `Search ${title.toLowerCase()}…`}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        {statusOptions?.length ? (
          <Select className="sm:w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        ) : null}
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                {columns.map((c) => (
                  <th key={c.key} className={cn('px-4 py-2.5 font-medium', c.className)}>
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                          sortBy === c.key && 'text-foreground',
                        )}
                      >
                        {c.label}
                        {sortBy === c.key ? (
                          sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td colSpan={columns.length} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                : items.length === 0
                  ? (
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        {emptyText}
                      </td>
                    </tr>
                  )
                  : items.map((row) => {
                      const href = rowHref?.(row);
                      const cells = columns.map((c) => (
                        <td key={c.key} className={cn('px-4 py-2.5', c.className)}>{renderCell(c, row)}</td>
                      ));
                      return (
                        <tr key={String(row.id)} className="border-b last:border-0 hover:bg-muted/40">
                          {href ? (
                            // display:contents keeps the <td>s as direct grid children of the row
                            <Link href={href} className="contents">
                              {cells}
                            </Link>
                          ) : (
                            cells
                          )}
                        </tr>
                      );
                    })}
            </tbody>
          </table>
        </div>

        {!loading && items.length > 0 ? (
          <div className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {items.length} of {total} · page {page} / {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Select
                className="h-8 w-28 text-xs"
                value={String(pageSize)}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
              </Select>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
