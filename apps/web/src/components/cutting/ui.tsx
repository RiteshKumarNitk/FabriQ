'use client';

import { Minus, Plus, X } from 'lucide-react';
import { garmentsPerMarker } from '@fabriq/shared';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function StatTile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-lg font-semibold tabular-nums',
          tone === 'good' && 'text-emerald-600',
          tone === 'warn' && 'text-amber-600',
          tone === 'bad' && 'text-red-600',
        )}
      >
        {value}
      </div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function PanelSection({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function SizeRatioEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  disabled?: boolean;
}) {
  const entries = Object.entries(value);
  function update(size: string, qty: number) {
    onChange({ ...value, [size]: Math.max(0, Math.floor(qty)) });
  }
  function addSize() {
    const next = `SIZE${entries.length + 1}`;
    onChange({ ...value, [next]: 1 });
  }
  function removeSize(size: string) {
    const copy = { ...value };
    delete copy[size];
    onChange(copy);
  }
  return (
    <div className="space-y-2">
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No sizes yet — add the size mix cut by this marker.</p>
      ) : null}
      {entries.map(([size, qty]) => (
        <div key={size} className="flex items-center gap-1.5">
          <Input
            className="h-8 w-20 text-xs font-semibold uppercase"
            value={size}
            disabled={disabled}
            onChange={(e) => {
              const newSize = e.target.value.toUpperCase();
              const copy: Record<string, number> = {};
              for (const [k, v] of Object.entries(value)) copy[k === size ? newSize : k] = v;
              onChange(copy);
            }}
          />
          <div className="flex items-center">
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={disabled} onClick={() => update(size, qty - 1)} aria-label={`Decrease ${size}`}>
              <Minus className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              min={0}
              className="h-8 w-14 rounded-none border-x-0 text-center text-xs"
              value={qty}
              disabled={disabled}
              onChange={(e) => update(size, Number(e.target.value))}
            />
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={disabled} onClick={() => update(size, qty + 1)} aria-label={`Increase ${size}`}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={disabled} onClick={() => removeSize(size)} aria-label={`Remove ${size}`}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addSize} disabled={disabled}>
          <Plus /> Add size
        </Button>
        <span className="text-xs font-medium text-muted-foreground">
          Garments / marker: <span className="text-sm font-semibold text-foreground">{garmentsPerMarker(value)}</span>
        </span>
      </div>
    </div>
  );
}
