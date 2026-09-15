'use client';

import { useMemo, useState } from 'react';
import { SegmentType, fromBase, toBase } from '@fabriq/shared';
import { cn } from '@/lib/utils';
import { fmtLength, LENGTH_UNIT_LABELS, LengthUnit } from '@/lib/units';

export interface TimelineSegment {
  id: string;
  startCm: number;
  endCm: number;
  type: SegmentType;
  refType?: string | null;
  refId?: string | null;
  label?: string | null;
}

interface RollTimelineProps {
  originalLengthCm: number;
  segments: TimelineSegment[];
  lengthUnit: LengthUnit;
  onSelect?: (segment: TimelineSegment) => void;
  selectedId?: string | null;
}

const SEGMENT_COLORS: Record<SegmentType, string> = {
  [SegmentType.AVAILABLE]: 'bg-emerald-200/70 border-emerald-400/60',
  [SegmentType.RESERVED]: 'bg-amber-200/70 border-amber-400/60',
  [SegmentType.CONSUMED]: 'bg-slate-300/70 border-slate-400/60',
  [SegmentType.DEFECT]: 'bg-red-300/80 border-red-500/70',
  [SegmentType.WASTE]: 'bg-orange-200/70 border-orange-400/60',
  [SegmentType.REMNANT]: 'bg-violet-200/70 border-violet-400/60',
};

const SEGMENT_TEXT: Record<SegmentType, string> = {
  [SegmentType.AVAILABLE]: 'Available',
  [SegmentType.RESERVED]: 'Reserved',
  [SegmentType.CONSUMED]: 'Consumed',
  [SegmentType.DEFECT]: 'Defect',
  [SegmentType.WASTE]: 'Waste',
  [SegmentType.REMNANT]: 'Remnant',
};

/**
 * VIEW A — Roll timeline. The whole roll drawn to scale along its length
 * (width is not to scale here). Meter ruler adapts its interval to zoom;
 * every segment is clickable for inspection.
 */
export function RollTimeline({ originalLengthCm, segments, lengthUnit, onSelect, selectedId }: RollTimelineProps) {
  const [hovered, setHovered] = useState<TimelineSegment | null>(null);

  // Adaptive ruler: aim for ~8 labeled ticks.
  const ticks = useMemo(() => {
    const list: number[] = [];
    if (originalLengthCm <= 0) return list;
    const inMeters = lengthUnit === LengthUnit.METERS;
    const stepCandidates = inMeters ? [0.5, 1, 2, 5, 10, 20, 50] : [5, 10, 25, 50, 100, 250, 500];
    const total = fromBase(originalLengthCm, lengthUnit);
    const step = stepCandidates.find((s) => total / s <= 12) ?? stepCandidates[stepCandidates.length - 1];
    for (let v = 0; v <= total + 1e-9; v += step) list.push(v);
    return list;
  }, [originalLengthCm, lengthUnit]);

  const toPct = (cm: number) => `${(cm / Math.max(originalLengthCm, 1e-6)) * 100}%`;

  return (
    <div className="space-y-1">
      {/* Ruler */}
      <div className="relative h-5 select-none">
        {ticks.map((t) => {
          const cm = toBase(t, lengthUnit);
          return (
            <div key={t} className="absolute top-0 h-full" style={{ left: toPct(cm) }}>
              <div className="h-2 w-px bg-border" />
              <div className="-translate-x-1/2 text-[10px] tabular-nums text-muted-foreground">
                {formatTick(t, lengthUnit)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Strip */}
      <div className="relative h-14 w-full overflow-hidden rounded-md border bg-muted/30">
        {segments.map((s) => {
          const selected = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              className={cn(
                'absolute inset-y-0 border-y border-r first:border-l px-1 text-left transition-shadow',
                SEGMENT_COLORS[s.type],
                selected && 'ring-2 ring-primary z-10',
                s.type === SegmentType.AVAILABLE && 'hover:bg-emerald-200',
              )}
              style={{ left: toPct(s.startCm), width: `calc(${toPct(s.endCm - s.startCm)} - 1px)` }}
              onClick={() => onSelect?.(s)}
              onMouseEnter={() => setHovered(s)}
              onMouseLeave={() => setHovered(null)}
              aria-label={`${SEGMENT_TEXT[s.type]} ${fmtLength(s.startCm, lengthUnit)}–${fmtLength(s.endCm, lengthUnit)}`}
            >
              <span className="block truncate text-[10px] font-medium leading-[3.4rem] text-slate-700">
                {(s.endCm - s.startCm) / originalLengthCm > 0.06 ? SEGMENT_TEXT[s.type] : ''}
              </span>
            </button>
          );
        })}
        {hovered ? (
          <div
            className="pointer-events-none absolute -top-1 z-20 -translate-y-full rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
            style={{ left: toPct((hovered.startCm + hovered.endCm) / 2) }}
          >
            <span className="font-medium">{SEGMENT_TEXT[hovered.type]}</span>
            {hovered.label ? <span className="text-muted-foreground"> · {hovered.label}</span> : null}
            <div className="tabular-nums text-muted-foreground">
              {fmtLength(hovered.startCm, lengthUnit)} → {fmtLength(hovered.endCm, lengthUnit)} ·{' '}
              {fmtLength(hovered.endCm - hovered.startCm, lengthUnit)}
            </div>
          </div>
        ) : null}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-muted-foreground">
        {Object.values(SegmentType).map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span className={cn('inline-block h-2.5 w-3 rounded-sm border', SEGMENT_COLORS[t])} />
            {SEGMENT_TEXT[t]}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatTick(value: number, unit: LengthUnit): string {
  const decimals = unit === LengthUnit.METERS || unit === LengthUnit.FEET ? 2 : 1;
  return `${Number(value.toFixed(decimals))} ${LENGTH_UNIT_LABELS[unit]}`;
}
