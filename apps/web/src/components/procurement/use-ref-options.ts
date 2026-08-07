'use client';

import { useEffect, useState } from 'react';
import { http } from '@/lib/api';

export interface RefOption {
  value: string;
  label: string;
  /** raw row for richer rendering in pickers */
  row?: Record<string, unknown>;
}

/** Loads { value: id, label } options from a paginated reference endpoint. */
export function useRefOptions(path?: string, key?: string): RefOption[] {
  const [options, setOptions] = useState<RefOption[]>([]);

  useEffect(() => {
    if (!path) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    http
      .get<unknown>(`${path}?pageSize=200`)
      .then((res) => {
        if (cancelled) return;
        const rows = (Array.isArray(res) ? res : (res as any)?.items ?? []) as Record<string, unknown>[];
        const labelFor = (r: Record<string, unknown>) => {
          const code = r.code as string | undefined;
          const name = (r.name as string) ?? `${(r.firstName as string) ?? ''} ${(r.lastName as string) ?? ''}`.trim();
          return code ? `${code} · ${name}`.trim() : name || String(r.email ?? r.id ?? '');
        };
        setOptions(rows.map((r) => ({ value: String(r.id), label: labelFor(r), row: r })));
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  return options;
}
