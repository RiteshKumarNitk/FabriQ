'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, Download } from 'lucide-react';
import { toast } from 'sonner';
import { type SafeEntityConfig, type EntityField } from '@/lib/entities';

import { http, list } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, type SortState } from './data-table';
import { EntityForm } from './entity-form';
import { titleCase } from '@/lib/utils';

interface EntityListPageProps {
  config: SafeEntityConfig;
  /** opens the edit dialog for this record id (from ?edit= query param) */
  editId?: string;
}

export function EntityListPage({ config, editId }: EntityListPageProps) {
  const { has } = useAuth();
  const canCreate = config.canCreate !== false && has(config.permissions.create);
  const canEdit = config.canEdit !== false && has(config.permissions.update);
  const canArchive = config.canArchive !== false && has(config.permissions.delete);

  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ sortBy: 'createdOn', sortOrder: 'desc' });
  const [filters, setFilters] = useState<Record<string, string>>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [archiving, setArchiving] = useState<Record<string, unknown> | null>(null);

  const filterFields = config.fields.filter((f) => f.type === 'select' && f.options && f.options.length <= 12);

  const [refOptions, setRefOptions] = useState<Record<string, Map<string, string>>>({});

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
      });
      if (search) params.set('search', search);
      if (Object.keys(filters).length > 0) params.set('filters', JSON.stringify(filters));
      const res = await list<Record<string, unknown>>(`${config.apiPath}?${params.toString()}`);
      setItems(res.items);
      setTotal(res.meta.total);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [config.apiPath, page, pageSize, search, sort, filters]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  // open edit dialog from ?edit= query param
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const record = await http.get<Record<string, unknown>>(`${config.apiPath}/${editId}`);
        setEditing(record);
        setFormOpen(true);
      } catch {
        /* ignore */
      }
    })();
  }, [editId, config.apiPath]);

  // load reference labels for columns
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, Map<string, string>> = {};
      for (const field of config.fields) {
        if (field.type !== 'ref' || !field.refPath || !config.columns.includes(field.name)) continue;
        try {
          const res = await http.get<any>(`${field.refPath}?pageSize=200`);
          const rows = Array.isArray(res) ? res : (res?.items ?? []);
          const map = new Map<string, string>();
          for (const row of rows) {
            map.set(row.id, row.code ? `${row.code} · ${row.name ?? ''}`.trim() : row.name);
          }
          next[field.name] = map;
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setRefOptions(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const resolveRef = useCallback(
    (field: EntityField, value: unknown) => {
      if (!value) return '—';
      const label = refOptions[field.name]?.get(String(value));
      return label ?? `#${String(value).slice(0, 8)}`;
    },
    [refOptions],
  );

  function resetToFirstPage() {
    setPage(1);
  }

  function onSaved() {
    setFormOpen(false);
    setEditing(null);
    toast.success(editing ? `${config.label} updated` : `${config.label} created`);
    void fetchItems();
  }

  async function confirmArchive() {
    if (!archiving) return;
    try {
      await http.post(`${config.apiPath}/${archiving.id}/archive`);
      toast.success(`${config.label} archived`);
      setArchiving(null);
      void fetchItems();
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to archive');
    }
  }

  function exportCsv() {
    const headers = config.columns;
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = items.map((item) => headers.map((h) => esc(item[h])));
    const csv = [headers.map(esc), ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{config.plural}</h2>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={items.length === 0}>
            <Download /> Export CSV
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => void fetchItems()} aria-label="Refresh">
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
          {canCreate ? (
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus /> New {config.label}
            </Button>
          ) : null}
        </div>
      </div>

      {/* search + filters */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={`Search ${config.plural.toLowerCase()}…`}
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetToFirstPage(); }}
          />
        </div>
        {filterFields.map((field) => (
          <Select
            key={field.name}
            placeholder={field.label}
            className="sm:w-44"
            value={filters[field.name] ?? ''}
            onChange={(e) => {
              const next = { ...filters };
              if (e.target.value) next[field.name] = e.target.value;
              else delete next[field.name];
              setFilters(next);
              resetToFirstPage();
            }}
          >
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ))}
      </div>

      <Card className="p-0">
        <DataTable
          config={config}
          items={items}
          loading={loading}
          pageIndex={page - 1}
          pageSize={pageSize}
          pageCount={Math.ceil(total / pageSize)}
          total={total}
          canEdit={canEdit}
          canArchive={canArchive}
          sortBy={sort.sortBy}
          sortOrder={sort.sortOrder}
          resolveRef={resolveRef}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          onSortChange={(s) => { setSort(s); resetToFirstPage(); }}
          onEdit={(record) => { setEditing(record); setFormOpen(true); }}
          onArchive={(record) => setArchiving(record)}
        />
      </Card>

      {/* create / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${config.label}` : `New ${config.label}`}</DialogTitle>
            <DialogDescription>
              {editing ? `Update ${titleCase(config.label).toLowerCase()} details.` : `Create a ${config.label.toLowerCase()}.`}
            </DialogDescription>
          </DialogHeader>
          <EntityForm
            key={String(editing?.id ?? 'new')}
            config={config}
            mode={editing ? 'edit' : 'create'}
            initial={editing ?? undefined}
            onCancel={() => { setFormOpen(false); setEditing(null); }}
            onSaved={onSaved}
          />
        </DialogContent>
      </Dialog>

      {/* archive confirm */}
      <Dialog open={Boolean(archiving)} onOpenChange={(open) => { if (!open) setArchiving(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive {config.label}?</DialogTitle>
            <DialogDescription>
              “{String(archiving?.name ?? archiving?.code ?? archiving?.email ?? archiving?.id ?? '').slice(0, 60)}” will be
              soft-deleted and hidden from lists. This can be reversed by an administrator.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setArchiving(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmArchive()}>Archive</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
