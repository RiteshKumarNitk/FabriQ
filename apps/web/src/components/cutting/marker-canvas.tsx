'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Maximize,
  Minus,
  Plus,
  RotateCw,
  Trash2,
  Undo2,
  Redo2,
  Magnet,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtLength, fmtAreaCm2, sizeColor, LengthUnit } from '@/lib/units';
import { computeViolations } from './marker-geometry';

export interface CanvasPiece {
  id: string;
  name: string;
  size?: string | null;
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
  rotationDeg: number;
  grainDirection?: string | null;
  mirrored?: boolean;
  color?: string | null;
}

export interface CanvasDefect {
  startCm: number;
  endCm: number;
  affectedWidthCm: number;
  severity?: string;
}

interface MarkerCanvasProps {
  widthCm: number; // usable width (marker Y extent)
  lengthCm: number; // marker length (X extent)
  pieces: CanvasPiece[];
  defects?: CanvasDefect[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (pieces: CanvasPiece[]) => void; // live geometry updates
  readOnly?: boolean;
  lengthUnit: LengthUnit;
}

const RULER_PX = 24;
const MIN_PX_PER_CM = 1.2;
const MAX_PX_PER_CM = 12;
const GRID_STEP_CM = 5;
const EPS = 1e-6;

type DragState =
  | { kind: 'none' }
  | { kind: 'move'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { kind: 'resize'; id: string; corner: string; startX: number; startY: number; orig: CanvasPiece }
  | { kind: 'pan'; startX: number; startY: number; origPanX: number; origPanY: number };

// ── geometry helpers live in ./marker-geometry (pure, unit-tested) ─────────

const snapWith = (v: number, snap: boolean) =>
  snap ? Math.round(v / GRID_STEP_CM) * GRID_STEP_CM : Math.round(v * 100) / 100;

// ── memoized piece renderer ────────────────────────────────────────────────
interface PieceViewProps {
  piece: CanvasPiece;
  pxPerCm: number;
  selected: boolean;
  invalid: boolean;
  defectHit: boolean;
  readOnly: boolean;
  onPointerDown: (e: React.PointerEvent, piece: CanvasPiece, corner?: string) => void;
}

/**
 * One pattern piece. Memoized: during a drag only the dragged piece's object
 * identity changes, so with a 200-piece marker the other 199 skip rendering.
 */
const PieceView = memo(function PieceView({
  piece: p,
  pxPerCm,
  selected,
  invalid,
  defectHit,
  readOnly,
  onPointerDown,
}: PieceViewProps) {
  const color = p.color || sizeColor(p.size);
  const cx = p.widthCm / 2;
  const cy = p.heightCm / 2;
  const grain = Math.min(cx, cy) * 0.6;
  return (
    <g
      transform={`translate(${p.xCm * pxPerCm}, ${p.yCm * pxPerCm}) rotate(${p.rotationDeg} ${cx * pxPerCm} ${cy * pxPerCm})`}
      onPointerDown={(e) => onPointerDown(e, p)}
      className={readOnly ? 'cursor-default' : 'cursor-move'}
    >
      {invalid ? (
        <rect
          x={-2}
          y={-2}
          width={p.widthCm * pxPerCm + 4}
          height={p.heightCm * pxPerCm + 4}
          fill="none"
          stroke="hsl(0 72% 51%)"
          strokeWidth="2"
          rx="2"
        />
      ) : null}
      <rect
        x={0}
        y={0}
        width={p.widthCm * pxPerCm}
        height={p.heightCm * pxPerCm}
        fill={`${color}33`}
        stroke={defectHit ? 'hsl(0 72% 51%)' : color}
        strokeWidth={selected ? 2.5 : 1.2}
        strokeDasharray={defectHit ? '5 3' : undefined}
      />
      {p.mirrored ? (
        <line
          x1={p.widthCm * pxPerCm}
          y1={0}
          x2={0}
          y2={p.heightCm * pxPerCm}
          stroke={color}
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      ) : null}
      {/* Grain arrow (vertical grain points along Y) */}
      <g transform={`translate(${cx * pxPerCm}, ${cy * pxPerCm})`} opacity="0.55">
        <line x1="0" y1={-grain * pxPerCm} x2="0" y2={grain * pxPerCm} stroke={color} strokeWidth="1.5" />
        {p.grainDirection !== 'HORIZONTAL' ? (
          <polygon
            points={`0,${-grain * pxPerCm - 4} -3,${-grain * pxPerCm + 2} 3,${-grain * pxPerCm + 2}`}
            fill={color}
          />
        ) : null}
      </g>
      {/* Label */}
      <text x={4} y={12} fontSize="10" fontWeight="600" fill={color}>
        {p.name}
        {p.size ? ` · ${p.size}` : ''}
      </text>
      {/* Resize handles */}
      {!readOnly && selected
        ? (['nw', 'ne', 'sw', 'se'] as const).map((c) => (
            <rect
              key={c}
              x={c.includes('w') ? -3 : p.widthCm * pxPerCm - 3}
              y={c.includes('n') ? -3 : p.heightCm * pxPerCm - 3}
              width="7"
              height="7"
              fill="white"
              stroke={color}
              strokeWidth="1.5"
              style={{ cursor: `${c}-resize` }}
              onPointerDown={(e) => onPointerDown(e, p, c)}
            />
          ))
        : null}
    </g>
  );
});

/**
 * VIEW B — Marker canvas. Pieces are placed in real-world cm mapped through
 * a single `pxPerCm` scale; every interaction round-trips through cm so the
 * saved geometry is always true to production dimensions.
 *
 * Performance notes (200+-piece markers are a supported scenario):
 *  - window pointer listeners subscribe ONCE (latest-ref pattern), so drag
 *    streams never race render-driven listener churn;
 *  - PieceView is memoized — dragging one piece re-renders exactly one piece;
 *  - violations run an interval sweep instead of an all-pairs scan.
 */
export function MarkerCanvas({
  widthCm,
  lengthCm,
  pieces,
  defects = [],
  selectedId,
  onSelect,
  onChange,
  readOnly = false,
  lengthUnit,
}: MarkerCanvasProps) {
  const [pxPerCm, setPxPerCm] = useState(2);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [snap, setSnap] = useState(true);
  const [showDefects, setShowDefects] = useState(true);
  const [history, setHistory] = useState<CanvasPiece[][]>([]);
  const [future, setFuture] = useState<CanvasPiece[][]>([]);
  const drag = useRef<DragState>({ kind: 'none' });
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Latest-ref: every stable callback reads live values from here, so window
  // listeners can subscribe once for the component's whole lifetime.
  const live = useRef({ pieces, pan, pxPerCm, snap, readOnly, selectedId, widthCm, lengthCm, defects, onSelect, onChange });
  live.current = { pieces, pan, pxPerCm, snap, readOnly, selectedId, widthCm, lengthCm, defects, onSelect, onChange };

  // ── history ────────────────────────────────────────────────────────────
  const pushHistory = useCallback((snapshot: CanvasPiece[]) => {
    setHistory((h) => [...h.slice(-49), snapshot]);
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    const { pieces: cur, onChange: emit } = live.current;
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [cur, ...f].slice(0, 50));
      emit(prev);
      return h.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    const { pieces: cur, onChange: emit } = live.current;
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setHistory((h) => [...h.slice(-49), cur]);
      emit(next);
      return f.slice(1);
    });
  }, []);

  // ── zoom ───────────────────────────────────────────────────────────────
  const zoom = useCallback((factor: number) => {
    setPxPerCm((z) => Math.min(MAX_PX_PER_CM, Math.max(MIN_PX_PER_CM, z * factor)));
  }, []);

  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const { widthCm: w, lengthCm: l } = live.current;
    const pad = 2 * RULER_PX + 20;
    const sx = (rect.width - pad) / Math.max(l, 1);
    const sy = (rect.height - pad) / Math.max(w, 1);
    const scale = Math.min(MAX_PX_PER_CM, Math.max(MIN_PX_PER_CM, Math.min(sx, sy)));
    setPxPerCm(scale);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    // Fit once on mount and whenever marker dimensions change drastically.
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthCm, widthCm]);

  // ── pointer handling (stable across renders) ───────────────────────────
  const svgPoint = useCallback((e: PointerEvent | React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current!;
    const { pan: pn, pxPerCm: ppc } = live.current;
    const rect = svg.getBoundingClientRect();
    // The drawing group is translated by (RULER_PX + pan) inside the svg.
    const gx = (e.clientX - rect.left - (RULER_PX + pn.x)) / ppc;
    const gy = (e.clientY - rect.top - (RULER_PX + pn.y)) / ppc;
    return { x: gx, y: gy };
  }, []);

  const onPiecePointerDown = useCallback(
    (e: React.PointerEvent, piece: CanvasPiece, corner?: string) => {
      const { readOnly: ro, pieces: cur, snap: sn } = live.current;
      if (ro) return;
      e.stopPropagation();
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {
        // pointerId may not be an active OS pointer (synthetic events, some
        // touch/pen paths) — capture is an optimization, not a requirement.
      }
      live.current.onSelect(piece.id);
      const p = svgPoint(e);
      if (corner) {
        drag.current = { kind: 'resize', id: piece.id, corner, startX: p.x, startY: p.y, orig: { ...piece } };
      } else {
        drag.current = { kind: 'move', id: piece.id, startX: p.x, startY: p.y, origX: piece.xCm, origY: piece.yCm };
      }
      pushHistory(cur);
    },
    [svgPoint, pushHistory],
  );

  const onBackgroundPointerDown = useCallback((e: React.PointerEvent) => {
    live.current.onSelect(null);
    drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, origPanX: live.current.pan.x, origPanY: live.current.pan.y };
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = drag.current;
      if (d.kind === 'none') return;
      const s = live.current;
      if (d.kind === 'pan') {
        setPan({ x: d.origPanX + (e.clientX - d.startX), y: d.origPanY + (e.clientY - d.startY) });
        return;
      }
      const p = svgPoint(e);
      if (d.kind === 'move') {
        const nx = snapWith(d.origX + (p.x - d.startX), s.snap);
        const ny = snapWith(d.origY + (p.y - d.startY), s.snap);
        s.onChange(s.pieces.map((pc) => (pc.id === d.id ? { ...pc, xCm: Math.max(0, nx), yCm: Math.max(0, ny) } : pc)));
      } else if (d.kind === 'resize') {
        const dxCm = p.x - d.startX;
        const dyCm = p.y - d.startY;
        s.onChange(
          s.pieces.map((pc) => {
            if (pc.id !== d.id) return pc;
            let { xCm, yCm, widthCm: w, heightCm: hgt } = { ...d.orig };
            let { xCm: ox, yCm: oy } = d.orig;
            if (d.corner.includes('e')) w = Math.max(1, d.orig.widthCm + dxCm);
            if (d.corner.includes('s')) hgt = Math.max(1, d.orig.heightCm + dyCm);
            if (d.corner.includes('w')) {
              w = Math.max(1, d.orig.widthCm - dxCm);
              ox = d.orig.xCm + (d.orig.widthCm - w);
            }
            if (d.corner.includes('n')) {
              hgt = Math.max(1, d.orig.heightCm - dyCm);
              oy = d.orig.yCm + (d.orig.heightCm - hgt);
            }
            xCm = snapWith(ox, s.snap);
            yCm = snapWith(oy, s.snap);
            return { ...pc, xCm, yCm, widthCm: Math.round(w * 100) / 100, heightCm: Math.round(hgt * 100) / 100 };
          }),
        );
      }
    }
    function onUp() {
      drag.current = { kind: 'none' };
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [svgPoint]);

  // ── keyboard (stable subscription) ─────────────────────────────────────
  const duplicateSelected = useCallback(() => {
    const { pieces: cur, selectedId: sel, readOnly: ro, onChange: emit } = live.current;
    const piece = cur.find((p) => p.id === sel);
    if (!piece || ro) return;
    pushHistory(cur);
    emit([
      ...cur,
      { ...piece, id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, xCm: piece.xCm + 2, yCm: piece.yCm + 2 },
    ]);
  }, [pushHistory]);

  const rotateSelected = useCallback(() => {
    const { pieces: cur, selectedId: sel, readOnly: ro, onChange: emit } = live.current;
    const piece = cur.find((p) => p.id === sel);
    if (!piece || ro) return;
    pushHistory(cur);
    emit(cur.map((p) => (p.id === sel ? { ...p, rotationDeg: ((p.rotationDeg + 90) % 360 + 360) % 360 } : p)));
  }, [pushHistory]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const s = live.current;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selectedId && !s.readOnly) {
          e.preventDefault();
          pushHistory(s.pieces);
          s.onChange(s.pieces.filter((p) => p.id !== s.selectedId));
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && s.selectedId && !s.readOnly) {
        e.preventDefault();
        duplicateSelected();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, pushHistory, duplicateSelected]);

  // ── derived values ─────────────────────────────────────────────────────
  const violations = useMemo(
    () => computeViolations(pieces, widthCm, lengthCm, defects),
    [pieces, widthCm, lengthCm, defects],
  );

  const totalPatternArea = useMemo(() => pieces.reduce((s, p) => s + p.widthCm * p.heightCm, 0), [pieces]);
  const markerArea = lengthCm * widthCm;
  const efficiency = markerArea > 0 ? Math.min(100, (totalPatternArea / markerArea) * 100) : 0;

  const W = lengthCm * pxPerCm;
  const H = widthCm * pxPerCm;

  // Adaptive ruler ticks (cm steps that scale with zoom).
  const lengthTicks = useMemo(() => {
    const targetPx = 90;
    const rawStep = targetPx / pxPerCm;
    const stepCm = [1, 2, 5, 10, 20, 25, 50, 100].find((s) => s >= rawStep) ?? 100;
    const ticks: number[] = [];
    for (let v = 0; v <= lengthCm + EPS; v += stepCm) ticks.push(v);
    return ticks;
  }, [lengthCm, pxPerCm]);

  const widthTicks = useMemo(() => {
    const targetPx = 60;
    const rawStep = targetPx / pxPerCm;
    const stepCm = [1, 2, 5, 10, 20].find((s) => s >= rawStep) ?? 20;
    const ticks: number[] = [];
    for (let v = 0; v <= widthCm + EPS; v += stepCm) ticks.push(v);
    return ticks;
  }, [widthCm, pxPerCm]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
        <ToolButton onClick={() => zoom(1.25)} label="Zoom in"><Plus className="h-4 w-4" /></ToolButton>
        <ToolButton onClick={() => zoom(0.8)} label="Zoom out"><Minus className="h-4 w-4" /></ToolButton>
        <ToolButton onClick={fit} label="Fit to screen"><Maximize className="h-4 w-4" /></ToolButton>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolButton onClick={undo} label="Undo (Ctrl+Z)" disabled={history.length === 0}><Undo2 className="h-4 w-4" /></ToolButton>
        <ToolButton onClick={redo} label="Redo (Ctrl+Shift+Z)" disabled={future.length === 0}><Redo2 className="h-4 w-4" /></ToolButton>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolButton onClick={rotateSelected} label="Rotate 90°" disabled={!selectedId || readOnly}><RotateCw className="h-4 w-4" /></ToolButton>
        <ToolButton onClick={duplicateSelected} label="Duplicate (Ctrl+D)" disabled={!selectedId || readOnly}><Copy className="h-4 w-4" /></ToolButton>
        <ToolButton
          onClick={() => {
            const { pieces: cur, selectedId: sel, readOnly: ro, onChange: emit } = live.current;
            if (sel && !ro) {
              pushHistory(cur);
              emit(cur.filter((p) => p.id !== sel));
            }
          }}
          label="Delete (Del)"
          disabled={!selectedId || readOnly}
        >
          <Trash2 className="h-4 w-4" />
        </ToolButton>
        <div className="mx-1 h-5 w-px bg-border" />
        <button
          type="button"
          onClick={() => setSnap((s) => !s)}
          className={cn(
            'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium',
            snap ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
          )}
          title="Toggle snapping"
        >
          <Magnet className="h-3.5 w-3.5" /> Snap {snap ? '5 cm' : 'off'}
        </button>
        {defects.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowDefects((s) => !s)}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium',
              showDefects ? 'bg-red-500/10 text-red-600' : 'text-muted-foreground hover:bg-accent',
            )}
            title="Toggle defect overlay"
          >
            <EyeOff className="h-3.5 w-3.5" /> Defects
          </button>
        ) : null}
        <div className="ml-auto pr-1 font-mono text-xs tabular-nums text-muted-foreground">
          {pxPerCm.toFixed(1)} px/cm · Efficiency {efficiency.toFixed(1)}%
        </div>
      </div>

      {/* Canvas surface */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <svg
          ref={svgRef}
          className="h-full w-full cursor-default touch-none select-none"
          onPointerDown={onBackgroundPointerDown}
          role="application"
          aria-label="Marker planning canvas"
        >
          <defs>
            <pattern id="grid" width={GRID_STEP_CM * pxPerCm} height={GRID_STEP_CM * pxPerCm} patternUnits="userSpaceOnUse">
              <path
                d={`M ${GRID_STEP_CM * pxPerCm} 0 L 0 0 0 ${GRID_STEP_CM * pxPerCm}`}
                fill="none"
                stroke="hsl(220 13% 88%)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <g transform={`translate(${RULER_PX + pan.x}, ${RULER_PX + pan.y})`}>
            {/* Length ruler (top) */}
            <g transform={`translate(0, ${-RULER_PX})`}>
              <rect x={-RULER_PX} y={-RULER_PX} width={W + 2 * RULER_PX} height={RULER_PX} fill="hsl(220 14% 96%)" />
              {lengthTicks.map((t) => (
                <g key={t} transform={`translate(${t * pxPerCm}, 0)`}>
                  <line x1="0" y1={-RULER_PX} x2="0" y2={-RULER_PX + 6} stroke="hsl(220 9% 45%)" />
                  <text x="2" y={-RULER_PX + 15} fontSize="9" fill="hsl(220 9% 45%)">
                    {lengthUnit === LengthUnit.METERS ? `${(t / 100).toFixed(1)}m` : `${t}cm`}
                  </text>
                </g>
              ))}
            </g>
            {/* Width ruler (left) */}
            <g transform={`translate(${-RULER_PX}, 0)`}>
              <rect x={-RULER_PX} y={-RULER_PX} width={RULER_PX} height={H + 2 * RULER_PX} fill="hsl(220 14% 96%)" />
              {widthTicks.map((t) => (
                <g key={t} transform={`translate(0, ${t * pxPerCm})`}>
                  <line x1={-RULER_PX} y1="0" x2={-RULER_PX + 6} y2="0" stroke="hsl(220 9% 45%)" />
                  <text x={-RULER_PX + 8} y="3" fontSize="9" fill="hsl(220 9% 45%)">
                    {t}
                  </text>
                </g>
              ))}
              <text transform={`rotate(-90) translate(${-H / 2}, ${-RULER_PX + 10})`} fontSize="9" fill="hsl(220 9% 45%)" textAnchor="middle">
                width cm
              </text>
            </g>

            {/* Fabric surface */}
            <rect x={0} y={0} width={W} height={H} fill="hsl(45 45% 96%)" />
            <rect x={0} y={0} width={W} height={H} fill="url(#grid)" />
            {/* Selvedge indicators */}
            <rect x={0} y={0} width={W} height={2} fill="hsl(220 10% 70%)" opacity="0.5" />
            <rect x={0} y={H - 2} width={W} height={2} fill="hsl(220 10% 70%)" opacity="0.5" />

            {/* Defect overlays */}
            {showDefects &&
              defects.map((d, i) => (
                <g key={i}>
                  <rect
                    x={d.startCm * pxPerCm}
                    y={Math.max(0, widthCm - d.affectedWidthCm) * pxPerCm}
                    width={(d.endCm - d.startCm) * pxPerCm}
                    height={Math.min(widthCm, d.affectedWidthCm || widthCm) * pxPerCm}
                    fill="rgba(239 68 68 / 0.35)"
                    stroke="rgba(239 68 68 / 0.7)"
                    strokeDasharray="4 3"
                  />
                </g>
              ))}

            {/* Pieces */}
            {pieces.map((p) => {
              const v = violations.get(p.id);
              return (
                <PieceView
                  key={p.id}
                  piece={p}
                  pxPerCm={pxPerCm}
                  selected={selectedId === p.id}
                  invalid={!!(v?.width || v?.overlap)}
                  defectHit={!!v?.defect}
                  readOnly={readOnly}
                  onPointerDown={onPiecePointerDown}
                />
              );
            })}
          </g>
        </svg>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-t bg-muted/30 px-3 py-1.5 text-[11px] tabular-nums text-muted-foreground">
        <span>Marker {fmtLength(lengthCm, lengthUnit)}</span>
        <span>Width {fmtLength(widthCm, lengthUnit)}</span>
        <span>Pieces {pieces.length}</span>
        <span>Pattern {fmtAreaCm2(totalPatternArea)}</span>
        <span>Area {fmtAreaCm2(markerArea)}</span>
        <span className={cn('font-medium', efficiency >= 80 ? 'text-emerald-600' : efficiency >= 70 ? 'text-amber-600' : 'text-red-600')}>
          Efficiency {efficiency.toFixed(1)}%
        </span>
        <span>Waste {fmtAreaCm2(Math.max(0, markerArea - totalPatternArea))}</span>
      </div>
    </div>
  );
}

function ToolButton({ children, onClick, label, disabled }: { children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}
