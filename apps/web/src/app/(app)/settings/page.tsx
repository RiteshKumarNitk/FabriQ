'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { titleCase } from '@/lib/utils';

type SettingsMap = Record<string, Record<string, string | number | boolean>>;

function stringify(value: string | number | boolean): string {
  return typeof value === 'boolean' ? String(value) : String(value);
}

export default function SettingsPage() {
  const [groups, setGroups] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroups(await http.get<SettingsMap>('/settings'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update(key: string, value: string) {
    setGroups((prev) => {
      const [group, ...rest] = key.split('.');
      const fullKey = rest.length > 0 ? key : group;
      const g = prev[group] ?? {};
      return { ...prev, [group]: { ...g, [fullKey]: value } };
    });
  }

  async function save() {
    setSaving(true);
    try {
      // flatten grouped map back to key → value
      const values: Record<string, string | number | boolean> = {};
      for (const [group, entries] of Object.entries(groups)) {
        for (const [key, value] of Object.entries(entries)) {
          values[key] = value;
        }
      }
      await http.put('/settings', { values });
      toast.success('Settings saved');
      void load();
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const groupNames = Object.keys(groups);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Tenant Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configuration that drives your manufacturing workflows and defaults.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Save
        </Button>
      </div>

      {groupNames.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No settings configured yet.
          </CardContent>
        </Card>
      ) : (
        groupNames.map((group) => (
          <Card key={group}>
            <CardHeader>
              <CardTitle className="text-sm capitalize">{titleCase(group)}</CardTitle>
              <CardDescription>Preferences for the {group} module.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Object.entries(groups[group]).map(([key, value]) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {titleCase(key.split('.').pop() ?? key)}
                  </label>
                  <Input value={stringify(value)} onChange={(e) => update(key, e.target.value)} />
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
