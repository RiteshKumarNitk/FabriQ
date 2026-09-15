'use client';

import { LengthUnit, fromBase, toBase } from '@fabriq/shared';

export { LengthUnit };

export const LENGTH_UNIT_LABELS: Record<LengthUnit, string> = {
  [LengthUnit.MM]: 'mm',
  [LengthUnit.CM]: 'cm',
  [LengthUnit.METERS]: 'm',
  [LengthUnit.INCHES]: 'in',
  [LengthUnit.FEET]: 'ft',
};

/** Format a base-unit (cm) length in the requested display unit. */
export function fmtLength(cm: number, unit: LengthUnit = LengthUnit.CM, decimals?: number): string {
  const v = fromBase(cm, unit);
  const d = decimals ?? (unit === LengthUnit.METERS || unit === LengthUnit.FEET ? 2 : 1);
  return `${v.toFixed(d)} ${LENGTH_UNIT_LABELS[unit]}`;
}

/** Convert a display-unit input into base cm. */
export function parseToCm(value: number, unit: LengthUnit): number {
  return toBase(value, unit);
}

/** Convert base cm into a display-unit number. */
export function cmTo(cm: number, unit: LengthUnit): number {
  return fromBase(cm, unit);
}

export function fmtAreaCm2(areaCm2: number): string {
  if (areaCm2 >= 10_000) return `${(areaCm2 / 10_000).toFixed(2)} m²`;
  return `${areaCm2.toFixed(0)} cm²`;
}

/** Sizes are drawn with a stable palette across the app. */
const SIZE_PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#f97316'];
export function sizeColor(size?: string | null): string {
  if (!size) return '#94a3b8';
  let hash = 0;
  for (let i = 0; i < size.length; i++) hash = (hash * 31 + size.charCodeAt(i)) >>> 0;
  return SIZE_PALETTE[hash % SIZE_PALETTE.length];
}
