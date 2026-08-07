'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { type SafeEntityConfig, type EntityField } from '@/lib/entities';

import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDateTime, titleCase } from '@/lib/utils';

export interface SortState {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface DataTableProps {
  config: SafeEntityConfig;
  items: Record<string, unknown>[];
  loading: boolean;
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  total: number;
  canEdit: boolean;
  canArchive: boolean;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  resolveRef: (field: EntityField, value: unknown) => string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSortChange: (sort: SortState) => void;
  onEdit: (record: Record<string, unknown>) => void;
  onArchive: (record: Record<string, unknown>) => void;
}

function Cell({ field, value, resolveRef }: { field?: EntityField; value: unknown; resolveRef: DataTableProps['resolveRef'] }) {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;
  if (field?.type === 'boolean') {
    return value ? <Badge variant="success">Yes</Badge> : <Badge variant="muted">No</Badge>;
  }
  if (field?.type === 'ref') {
    return <span className="font-medium">{resolveRef(field, value)}</span>;
  }
  if (field?.type === 'select' || field?.name === 'status') {
    return <Badge variant={statusVariant(String(value))}>{String(value).replace(/_/g, ' ')}</Badge>;
  }
  if (typeof value === 'string' && /(On|At|Date)$/.test(field?.name ?? '')) {
    return <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(value)}</span>;
  }
  return <span className="truncate">{String(value)}</span>;
}

export function DataTable({
  config,
  items,
  loading,
  pageIndex,
  pageSize,
  pageCount,
  total,
  canEdit,
  canArchive,
  sortBy,
  sortOrder,
  resolveRef,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  onEdit,
  onArchive,
}: DataTableProps) {
  const fields = useMemo(() => new Map(config.fields.map((f) => [f.name, f])), [config]);
  const sortable = config.fields.filter((f) => f.column);

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const cols: ColumnDef<Record<string, unknown>>[] = config.columns.map((name) => {
      const field = fields.get(name);
      return {
        accessorKey: name,
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <button
              className="inline-flex items-center gap-1.5 hover:text-foreground"
              onClick={() => onSortChange({
                sortBy: name,
                sortOrder: sorted === 'asc' ? 'desc' : 'asc',
              })}
            >
              {field?.label ?? titleCase(name)}
              {sorted === 'asc' ? <ArrowUp className="h-3 w-3" /> : sorted === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
            </button>
          );
        },
        cell: ({ row }) => <Cell field={field} value={row.getValue(name)} resolveRef={resolveRef} />,
      };
    });

    cols.push({
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const record = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Row actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/admin/${config.key}/${record.id}`}>
                    <Eye /> View
                  </Link>
                </DropdownMenuItem>
                {canEdit && config.canEdit !== false ? (
                  <DropdownMenuItem onClick={() => onEdit(record)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                ) : null}
                {canArchive && config.canArchive !== false ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onArchive(record)}>
                      <Trash2 /> Archive
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    });
    return cols;
  }, [config, fields, resolveRef, canEdit, canArchive, onSortChange, onEdit, onArchive]);

  const table = useReactTable({
    data: items,
    columns,
    manualPagination: true,
    manualSorting: true,
    pageCount,
    rowCount: total,
    state: {
      pagination: { pageIndex, pageSize },
      sorting: [{ id: sortBy, desc: sortOrder === 'desc' }],
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater;
      if (next.pageSize !== pageSize) onPageSizeChange(next.pageSize);
      else if (next.pageIndex !== pageIndex) onPageChange(next.pageIndex + 1);
    },
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: { minSize: 0, size: 0 },
  });

  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, total);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-muted/40">
                {hg.headers.map((header) => (
                  <th key={header.id} className="h-10 px-4 text-left align-middle text-xs font-semibold text-muted-foreground">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td colSpan={columns.length} className="px-4 py-2">
                    <Skeleton className="h-8 w-full" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <p className="text-sm font-medium text-muted-foreground">No records found</p>
                  <p className="text-xs text-muted-foreground/70">Try adjusting your search or filters.</p>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-accent/40">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="max-w-56 px-4 py-2.5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row">
        <p>
          Showing <span className="font-medium text-foreground">{from}–{to}</span> of{' '}
          <span className="font-medium text-foreground">{total}</span>
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs">
            Rows
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={pageIndex === 0 || loading}
              onClick={() => onPageChange(pageIndex)}
            >
              Previous
            </Button>
            <span className="px-2 text-xs">
              Page {pageIndex + 1} of {Math.max(pageCount, 1)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pageIndex + 1 >= pageCount || loading}
              onClick={() => onPageChange(pageIndex + 2)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
