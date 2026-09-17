'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Shield } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The /permissions endpoint returns the catalog grouped by module
 * ({ module, permissions: [...] }), not a paginated flat list — the generic
 * admin table cannot render it. This page is the proper read-only catalog UI.
 * Static route shadows /admin/[entity], which previously mishandled this key.
 */

interface PermissionDef {
  code: string;
  module: string;
  name: string;
  description: string;
}

interface PermissionGroup {
  module: string;
  permissions: PermissionDef[];
}

export default function PermissionsCatalogPage() {
  const { has } = useAuth();
  const canView = has('permission:read');

  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await http.get<PermissionGroup[]>('/permissions');
        if (!cancelled) setGroups(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canView]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter(
          (p) =>
            p.code.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [groups, search]);

  const total = groups.reduce((sum, g) => sum + g.permissions.length, 0);
  const shown = filtered.reduce((sum, g) => sum + g.permissions.length, 0);

  if (!loading && !canView) {
    return (
      <Card className="p-8 text-center">
        <Shield className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          You need the <span className="font-mono">permission:read</span> permission to view the catalog.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Permissions</h2>
        <p className="text-sm text-muted-foreground">
          The full permission catalog grouped by module. Assign codes to roles under
          Roles; the catalog itself is read-only. {total} permissions.
          {search ? ` ${shown} shown.` : ''}
        </p>
      </div>

      <div className="relative sm:max-w-xs sm:flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search permissions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-40" />
              <div className="mt-4 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {search ? 'No permissions match your search' : 'No permissions found'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((group) => (
            <Card key={group.module} className="p-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="text-sm font-semibold">{group.module}</h3>
                <Badge variant="muted">{group.permissions.length}</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                      <th className="h-9 px-4">Code</th>
                      <th className="h-9 px-4">Name</th>
                      <th className="hidden h-9 px-4 md:table-cell">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.permissions.map((p) => (
                      <tr key={p.code} className="border-b last:border-0 hover:bg-accent/40">
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span className="font-mono text-xs">{p.code}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium">{p.name}</td>
                        <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                          {p.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
