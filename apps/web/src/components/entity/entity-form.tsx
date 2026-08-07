'use client';

import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { type SafeEntityConfig, type EntityField, type FieldOption } from '@/lib/entities';
import { http } from '@/lib/api';
import { cn, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';

export function buildZodSchema(config: SafeEntityConfig, mode: 'create' | 'edit') {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of config.fields) {
    if (field.displayOnly || (field.createOnly && mode === 'edit')) continue;
    const toOptional = (s: z.ZodTypeAny) => z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : v), s);

    switch (field.type) {
      case 'number': {
        let s = z.number({ invalid_type_error: 'Must be a number' });
        if (field.min !== undefined) s = s.min(field.min);
        if (field.max !== undefined) s = s.max(field.max);
        shape[field.name] = field.required ? toOptional(s) : toOptional(s).optional();
        break;
      }
      case 'boolean':
        shape[field.name] = z.boolean().optional();
        break;
      case 'multi':
        shape[field.name] = z.array(z.string()).optional();
        break;
      case 'json': {
        const base = z
          .string()
          .refine((v) => v === undefined || v === '' || parseJson(v), { message: 'Must be valid JSON' });
        shape[field.name] = field.required ? base.refine((v) => v && v !== '', { message: 'Required' }) : base.optional();
        break;
      }
      case 'email': {
        shape[field.name] = field.required
          ? z.string().email('Invalid email')
          : (z.string().email('Invalid email').or(z.literal('')) as z.ZodTypeAny).optional();
        break;
      }
      default: {
        let s = z.string();
        if (field.minLength) s = s.min(field.minLength, `Min ${field.minLength} characters`);
        if (field.maxLength) s = s.max(field.maxLength, `Max ${field.maxLength} characters`);
        if (field.pattern) s = s.regex(new RegExp(field.pattern), field.patternMessage ?? 'Invalid format');
        if (field.required) s = s.min(1, 'Required');
        shape[field.name] = field.required ? s : s.optional();
      }
    }
  }
  return z.object(shape);
}

function parseJson(v: string): boolean {
  try {
    JSON.parse(v);
    return true;
  } catch {
    return false;
  }
}

function defaultValues(config: SafeEntityConfig, initial?: Record<string, unknown>) {
  const values: Record<string, unknown> = {};
  for (const field of config.fields) {
    if (initial && initial[field.name] !== undefined) {
      if (field.type === 'multi') {
        values[field.name] = Array.isArray(initial[field.name]) ? initial[field.name] : [];
      } else if (field.type === 'json') {
        values[field.name] =
          initial[field.name] !== null && initial[field.name] !== undefined
            ? JSON.stringify(initial[field.name], null, 2)
            : '';
      } else {
        values[field.name] = initial[field.name];
      }
      continue;
    }
    if (field.type === 'boolean') values[field.name] = false;
    if (field.type === 'multi') values[field.name] = [];
  }
  return values;
}

async function loadOptions(field: EntityField): Promise<FieldOption[]> {
  if (field.options) return field.options;
  if (!field.refPath) return [];
  if (field.refPath === '/permissions') {
    const groups = await http.get<Array<{ module: string; permissions: Array<{ code: string; name: string }> }>>(
      '/permissions',
    );
    return groups.flatMap((g) =>
      g.permissions.map((p) => ({
        label: `${p.code} — ${p.name}`,
        value: p.code,
        group: g.module,
      })),
    );
  }
  const res = await http.get<any>(`${field.refPath}?pageSize=200`);
  const rows = Array.isArray(res) ? res : (res?.items ?? []);
  return rows.map((item: any) => ({
    label: item.code ? `${item.code} · ${item.name ?? ''}`.trim() : item.name,
    value: item.id,
  }));
}

interface EntityFormProps {
  config: SafeEntityConfig;
  mode: 'create' | 'edit';
  initial?: Record<string, unknown>;
  onCancel: () => void;
  onSaved: (record: Record<string, unknown>) => void;
}

export function EntityForm({ config, mode, initial, onCancel, onSaved }: EntityFormProps) {
  const schema = useMemo(() => buildZodSchema(config, mode), [config, mode]);
  const [options, setOptions] = useState<Record<string, FieldOption[]>>({});
  const [submitting, setSubmitting] = useState(false);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(config, initial) as Record<string, any>,
  });

  const { register, control, handleSubmit, formState } = form;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map: Record<string, FieldOption[]> = {};
      for (const field of config.fields) {
        if (field.type === 'select' && field.options) {
          map[field.name] = field.options;
        } else if ((field.type === 'ref' || field.type === 'multi') && field.refPath) {
          try {
            map[field.name] = await loadOptions(field);
          } catch {
            map[field.name] = [];
          }
        }
      }
      if (!cancelled) setOptions(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [config]);

  const editableFields = config.fields.filter((f) => !f.displayOnly && !(f.createOnly && mode === 'edit'));

  async function onSubmit(values: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v === undefined || v === null) continue;
        if ((k === 'steps' || k === 'attributes') && typeof v === 'string' && v.trim()) {
          payload[k] = JSON.parse(v);
          continue;
        }
        payload[k] = v;
      }
      const endpoint = mode === 'create' ? config.apiPath : `${config.apiPath}/${initial?.id}`;
      const method = mode === 'create' ? http.post : http.patch;
      const record = await method<Record<string, unknown>>(endpoint, payload);
      onSaved(record);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {editableFields.map((field) => (
          <div
            key={field.name}
            className={cn(
              'space-y-1.5',
              field.type === 'textarea' || field.type === 'json' || field.type === 'multi' ? 'sm:col-span-2' : '',
            )}
          >
            <Label htmlFor={field.name}>
              {field.label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </Label>
            <FieldRenderer
              field={field}
              options={options[field.name] ?? []}
              register={register}
              control={control}
              initial={initial}
              error={formState.errors[field.name]?.message as string | undefined}
            />
            {field.help ? <p className="text-[11px] text-muted-foreground">{field.help}</p> : null}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {mode === 'create' ? 'Create' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

function FieldRenderer({
  field,
  options,
  register,
  control,
  initial,
  error,
}: {
  field: EntityField;
  options: FieldOption[];
  register: any;
  control: any;
  initial?: Record<string, unknown>;
  error?: string;
}) {
  const inputClass = cn(error && 'border-destructive focus-visible:ring-destructive');
  const currentValue = useWatch({ control, name: field.name });

  switch (field.type) {
    case 'password':
      return (
        <>
          <Input id={field.name} type="password" placeholder={field.placeholder} className={inputClass} {...register(field.name)} />
          <ErrorHint error={error} />
        </>
      );
    case 'number':
      return (
        <>
          <Input id={field.name} type="number" placeholder={field.placeholder} className={inputClass} {...register(field.name)} />
          <ErrorHint error={error} />
        </>
      );
    case 'textarea':
      return (
        <>
          <Textarea id={field.name} placeholder={field.placeholder} className={inputClass} {...register(field.name)} />
          <ErrorHint error={error} />
        </>
      );
    case 'json':
      return (
        <>
          <Textarea id={field.name} placeholder={field.placeholder ?? '{ }'} className={cn('font-mono text-xs', inputClass)} rows={5} {...register(field.name)} />
          <ErrorHint error={error} />
        </>
      );
    case 'select':
      return (
        <>
          <Select id={field.name} placeholder="Select…" className={inputClass} {...register(field.name)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <ErrorHint error={error} />
        </>
      );
    case 'ref': {
      const unknownValue = currentValue && !options.some((o) => o.value === currentValue);
      return (
        <>
          <Select id={field.name} placeholder="Select…" className={inputClass} {...register(field.name)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {unknownValue ? (
              <option value={currentValue}>{`${titleCase(field.label)} #${String(currentValue).slice(0, 8)}`}</option>
            ) : null}
          </Select>
          <ErrorHint error={error} />
        </>
      );
    }
    case 'multi':
      return (
        <>
          <div className={cn('max-h-52 space-y-1 overflow-y-auto rounded-md border p-2', error && 'border-destructive')}>
            <Controller
              name={field.name}
              control={control}
              render={({ field: rhf }) => {
                const selected: string[] = rhf.value ?? [];
                const grouped = groupOptions(options);
                if (grouped.length === 0) {
                  return <p className="px-1 py-2 text-xs text-muted-foreground">No options available</p>;
                }
                return <>{grouped.map(({ label: groupLabel, options: groupItems }) => (
                  <div key={groupLabel}>
                    {groupLabel ? (
                      <div className="px-1.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {groupLabel}
                      </div>
                    ) : null}
                    {groupItems.map((o) => {
                      const checked = selected.includes(o.value);
                      return (
                        <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input accent-primary"
                            checked={checked}
                            onChange={() => rhf.onChange(checked ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
                          />
                          <span className="truncate">{o.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}</>;
              }}
            />
          </div>
          <ErrorHint error={error} />
        </>
      );
    case 'boolean':
      return (
        <>
          <Controller
            name={field.name}
            control={control}
            render={({ field: rhf }) => (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={Boolean(rhf.value)}
                  onChange={(e) => rhf.onChange(e.target.checked)}
                />
                <span className="text-muted-foreground">Enabled</span>
              </label>
            )}
          />
          <ErrorHint error={error} />
        </>
      );
    default:
      return (
        <>
          <Input
            id={field.name}
            type={field.type === 'email' ? 'email' : 'text'}
            placeholder={field.placeholder}
            className={inputClass}
            {...register(field.name)}
          />
          <ErrorHint error={error} />
        </>
      );
  }
}

function groupOptions(options: FieldOption[]): Array<{ label?: string; options: FieldOption[] }> {
  const grouped = new Map<string, FieldOption[]>();
  for (const o of options) {
    const key = o.group ?? '';
    grouped.set(key, [...(grouped.get(key) ?? []), o]);
  }
  return Array.from(grouped.entries()).map(([label, items]) => ({ label, options: items }));
}

function ErrorHint({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-xs text-destructive">{error}</p>;
}
