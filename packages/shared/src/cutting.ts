import { LengthUnit, SegmentType } from './enums';

/**
 * Fabric cutting-planner calculation engine.
 *
 * This module is THE single authoritative implementation of every production
 * formula (units, marker geometry, efficiency, lays, consumption, remaining
 * fabric, placement validation). The frontend may re-run it for live UX, but
 * the API re-runs the same functions server-side when saving / finalizing, so
 * the numbers can never drift between client and server.
 *
 * Base unit: CENTIMETERS for lengths, SQUARE CENTIMETERS for areas. All
 * math happens in the base unit; display units are only applied at render
 * time. Never calculate from formatted strings.
 */

export const BASE_LENGTH_UNIT = LengthUnit.CM;
export const CM_PER_METER = 100;
export const CM_PER_INCH = 2.54;
export const CM_PER_FOOT = 30.48;
export const CM_PER_MM = 0.1;

/** Convert any supported length unit into the base unit (cm). */
export function toBase(value: number, unit: LengthUnit = LengthUnit.CM): number {
  switch (unit) {
    case LengthUnit.MM:
      return value * CM_PER_MM;
    case LengthUnit.METERS:
      return value * CM_PER_METER;
    case LengthUnit.INCHES:
      return value * CM_PER_INCH;
    case LengthUnit.FEET:
      return value * CM_PER_FOOT;
    case LengthUnit.CM:
    default:
      return value;
  }
}

/** Convert a base-unit (cm) value into the requested display unit. */
export function fromBase(value: number, unit: LengthUnit = LengthUnit.CM): number {
  switch (unit) {
    case LengthUnit.MM:
      return value / CM_PER_MM;
    case LengthUnit.METERS:
      return value / CM_PER_METER;
    case LengthUnit.INCHES:
      return value / CM_PER_INCH;
    case LengthUnit.FEET:
      return value / CM_PER_FOOT;
    case LengthUnit.CM:
    default:
      return value;
  }
}

/** Round away float noise (0.1+0.2 style artifacts) to 4 decimals. */
export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

// ── Geometry ─────────────────────────────────────────────────────────────

export interface Rect {
  x: number; // cm from marker origin (left edge)
  y: number; // cm from marker origin (top edge)
  width: number; // cm
  height: number; // cm
  rotation?: number; // degrees, clockwise
}

/** Axis-aligned bounding box of a (possibly rotated) rectangle in cm space.
 * (x, y) is the un-rotated top-left; rotation happens around the rect center,
 * so the AABB center never moves. */
export function boundingBox(rect: Rect): { minX: number; minY: number; maxX: number; maxY: number } {
  const rotation = ((rect.rotation ?? 0) % 360 + 360) % 360;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bw = rect.width * cos + rect.height * sin;
  const bh = rect.width * sin + rect.height * cos;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return {
    minX: cx - bw / 2,
    minY: cy - bh / 2,
    maxX: cx + bw / 2,
    maxY: cy + bh / 2,
  };
}

/** Simple rectangle intersection test (ignores rotation; conservative). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  const ra = boundingBox(a);
  const rb = boundingBox(b);
  return (
    ra.minX < rb.maxX - 1e-6 &&
    ra.maxX > rb.minX + 1e-6 &&
    ra.minY < rb.maxY - 1e-6 &&
    ra.maxY > rb.minY + 1e-6
  );
}

/** 1-D interval overlap length between two [start,end] ranges (cm). */
export function intervalOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

// ── Marker ───────────────────────────────────────────────────────────────

export interface MarkerPieceInput {
  id?: string;
  width: number; // cm (pattern bounding width, un-rotated)
  height: number; // cm (pattern bounding height, un-rotated)
  x: number; // cm
  y: number; // cm
  rotation?: number; // degrees
}

export interface MarkerCalcInput {
  /** Fabric usable width in cm — pieces must fit inside this. */
  usableWidthCm: number;
  /** Physical marker length in cm (or null to derive from pieces). */
  lengthCm?: number | null;
  /** End allowance configured by the factory (cm), added to the derived length. */
  endAllowanceCm?: number;
  /** Placement rows (pattern pieces). */
  pieces: MarkerPieceInput[];
}

export interface MarkerCalcResult {
  lengthCm: number;
  usableWidthCm: number;
  markerAreaCm2: number;
  patternAreaCm2: number;
  wasteAreaCm2: number;
  efficiencyPct: number; // 0–100, planning efficiency
  garmentsPerMarker: number;
}

/** Farthest piece edge along the marker length, + end allowance. */
export function deriveMarkerLength(pieces: MarkerPieceInput[], endAllowanceCm = 0): number {
  let maxEnd = 0;
  for (const p of pieces) {
    const bb = boundingBox(p);
    maxEnd = Math.max(maxEnd, bb.maxX);
  }
  return round4(maxEnd > 0 ? maxEnd + endAllowanceCm : 0);
}

export function calculateMarker(input: MarkerCalcInput): MarkerCalcResult {
  const usableWidthCm = input.usableWidthCm;
  const derived =
    input.lengthCm != null && input.lengthCm > 0
      ? input.lengthCm
      : deriveMarkerLength(input.pieces, input.endAllowanceCm ?? 0);
  const lengthCm = Math.max(derived, 0);
  const markerAreaCm2 = round4(lengthCm * usableWidthCm);
  const patternAreaCm2 = round4(input.pieces.reduce((sum, p) => sum + p.width * p.height, 0));
  const wasteAreaCm2 = round4(Math.max(0, markerAreaCm2 - patternAreaCm2));
  const efficiencyPct = markerAreaCm2 > 0 ? round4((patternAreaCm2 / markerAreaCm2) * 100) : 0;
  return {
    lengthCm,
    usableWidthCm,
    markerAreaCm2,
    patternAreaCm2,
    wasteAreaCm2,
    efficiencyPct: Math.min(efficiencyPct, 100),
    garmentsPerMarker: 0, // filled by caller from size ratio
  };
}

export function garmentsPerMarker(sizeRatio: Record<string, number>): number {
  return Object.values(sizeRatio).reduce((sum, qty) => sum + Math.max(0, Math.floor(qty)), 0);
}

// ── Lay / production math ────────────────────────────────────────────────

export interface LayCalcInput {
  markerLengthCm: number;
  garmentsPerMarker: number;
  ply: number;
}

export interface LayCalcResult {
  ply: number;
  garmentsPerLayer: number;
  theoreticalPieces: number; // garment sets produced by this lay
  fabricRequiredCm: number; // single-ply marker length (physical fabric used)
}

export function calculateLay(input: LayCalcInput): LayCalcResult {
  const ply = Math.max(0, Math.floor(input.ply));
  return {
    ply,
    garmentsPerLayer: input.garmentsPerMarker,
    theoreticalPieces: ply * input.garmentsPerMarker,
    fabricRequiredCm: round4(input.markerLengthCm), // ply is stacked layers, NOT multiplied length
  };
}

/** How many lays are needed to cover `requiredUnits` garments. */
export function laysRequired(requiredUnits: number, garmentsPerMarker: number, ply: number): number {
  if (garmentsPerMarker <= 0 || ply <= 0) return 0;
  return Math.max(0, Math.ceil(requiredUnits / (garmentsPerMarker * ply)));
}

/** Fabric needed (cm, single-ply) for N lays of the given marker length. */
export function fabricForLays(layCount: number, markerLengthCm: number): number {
  return round4(Math.max(0, layCount) * markerLengthCm);
}

// ── Roll / remaining fabric ──────────────────────────────────────────────

export interface RollLedgerEntry {
  type: string; // RollTransactionType value
  quantityCm: number; // signed: negative = removed from the roll
  refType?: string | null;
  refId?: string | null;
  refLabel?: string | null;
  createdOn?: string | Date;
}

export interface RollSummaryInput {
  originalLengthCm: number;
  ledger: RollLedgerEntry[];
  /** Known defect span totals (cm) — they stay ON the roll until consumed/written off. */
  defectLengthCm?: number;
}

export interface RollSummaryResult {
  originalLengthCm: number;
  consumedCm: number;
  reservedCm: number;
  defectCm: number;
  wasteCm: number;
  remnantCm: number;
  availableCm: number;
  remainingCm: number; // physical length still on the roll (never negative)
}

export function summarizeRoll(input: RollSummaryInput): RollSummaryResult {
  let consumed = 0;
  let reserved = 0;
  let released = 0;
  let waste = 0;
  let remnant = 0;
  let adjustmentDelta = 0;
  for (const e of input.ledger) {
    const q = Math.abs(e.quantityCm);
    switch (e.type) {
      case 'CONSUMED':
        consumed += q;
        break;
      case 'RESERVED':
        reserved += q;
        break;
      case 'RELEASED':
        // A cancelled lay releases its reservation — available must net
        // these out, otherwise the summary understates usable fabric.
        released += q;
        break;
      case 'WASTE':
        waste += q;
        break;
      case 'REMNANT':
        remnant += q;
        break;
      case 'ADJUSTMENT':
        // Signed correction rows (the service applies them to
        // remainingLengthCm directly) — replay them so the recomputed
        // summary always reconciles with the stored balance.
        adjustmentDelta += e.quantityCm;
        break;
      default:
        break; // MEASURED / DEFECT_MARKED don't move material
    }
  }
  const remaining = Math.max(
    0,
    round4(input.originalLengthCm - consumed - waste - remnant + adjustmentDelta),
  );
  return {
    originalLengthCm: round4(input.originalLengthCm),
    consumedCm: round4(consumed),
    reservedCm: round4(Math.max(0, reserved - released)),
    defectCm: round4(input.defectLengthCm ?? 0),
    wasteCm: round4(waste),
    remnantCm: round4(remnant),
    availableCm: Math.max(0, round4(remaining - Math.max(0, reserved - released))),
    remainingCm: remaining,
  };
}

// ── Validation ───────────────────────────────────────────────────────────

export interface PlacementIssue {
  code:
    | 'OUTSIDE_WIDTH'
    | 'OUTSIDE_MARKER'
    | 'OVERLAP'
    | 'CROSSES_SELVEDGE'
    | 'CROSSES_DEFECT';
  message: string;
  pieceId?: string;
  otherPieceId?: string;
  defectId?: string;
}

export interface DefectSpan {
  id?: string;
  startCm: number;
  endCm: number;
}

/**
 * Validate a marker layout. Returns every violation — an empty list means the
 * marker can be finalized. Blocking violations: OUTSIDE_WIDTH, OUTSIDE_MARKER,
 * OVERLAP. CROSSES_DEFECT is returned as a warning the finalize flow must
 * surface and require confirmation for.
 */
export function validatePlacement(input: {
  pieces: MarkerPieceInput[];
  usableWidthCm: number;
  markerLengthCm: number;
  /** Defect spans along the roll (absolute cm from roll start). */
  defects?: DefectSpan[];
  /** Where this marker starts on the roll (cm) when validating against defects. */
  markerStartCm?: number;
}): PlacementIssue[] {
  const issues: PlacementIssue[] = [];
  const { pieces, usableWidthCm, markerLengthCm } = input;

  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const bb = boundingBox(p);
    if (bb.minX < -1e-6) {
      issues.push({ code: 'OUTSIDE_MARKER', message: 'Piece starts before the marker origin', pieceId: p.id ?? String(i) });
    }
    if (bb.maxX > markerLengthCm + 1e-6) {
      issues.push({ code: 'OUTSIDE_MARKER', message: 'Piece extends past the marker end', pieceId: p.id ?? String(i) });
    }
    if (bb.minY < -1e-6 || bb.maxY > usableWidthCm + 1e-6) {
      issues.push({ code: 'OUTSIDE_WIDTH', message: 'Piece does not fit inside the usable fabric width', pieceId: p.id ?? String(i) });
    }
    if (bb.maxY > usableWidthCm - 1e-6 && bb.maxY <= usableWidthCm + 1e-6) {
      // touching the edge is allowed; strictly past = selvedge crossing handled by OUTSIDE_WIDTH
    }
    for (let j = i + 1; j < pieces.length; j++) {
      if (rectsOverlap(p, pieces[j])) {
        issues.push({
          code: 'OVERLAP',
          message: 'Pattern pieces overlap',
          pieceId: p.id ?? String(i),
          otherPieceId: pieces[j].id ?? String(j),
        });
      }
    }
  }

  if (input.defects?.length) {
    const markerStart = input.markerStartCm ?? 0;
    for (const d of input.defects) {
      const overlap = intervalOverlap(markerStart, markerStart + markerLengthCm, d.startCm, d.endCm);
      if (overlap > 1e-6) {
        issues.push({
          code: 'CROSSES_DEFECT',
          message: `Marker crosses defect area (${round4(overlap)} cm of its length)`,
          defectId: d.id,
        });
      }
    }
  }

  return issues;
}

/** True when a marker span fits entirely inside an available segment. */
export function fitsInSegment(
  markerLengthCm: number,
  segment: { startCm: number; endCm: number; type: string },
): boolean {
  if (segment.type !== SegmentType.AVAILABLE) return false;
  return segment.endCm - segment.startCm >= markerLengthCm - 1e-6;
}

// ── Segment partition (roll timeline) ────────────────────────────────────

export interface PartitionDefect {
  id: string;
  code?: string | null;
  startCm: number;
  endCm: number;
}

export interface PartitionLay {
  id: string;
  /** Absolute placement on the roll (cm). */
  startCm: number;
  endCm: number;
  /** Completed lays are CONSUMED; otherwise RESERVED. */
  completed: boolean;
}

export interface PartitionRow {
  startCm: number;
  endCm: number;
  type: SegmentType;
  refType?: string;
  refId?: string;
  label?: string;
}

/**
 * Pure segment-partition builder — THE authoritative roll-timeline logic.
 *
 * Splits [0, total] into non-overlapping cells at every defect/lay boundary
 * and classifies each cell: an active lay span wins over a defect (a lay can
 * never be placed over a defect, so a lay never overlaps a defect span in
 * practice; if data ever says otherwise the lay wins and the inconsistency
 * stays visible), a defect span becomes DEFECT, everything else AVAILABLE.
 * Idempotent — the same inputs always produce the same rows.
 */
export function buildSegmentPartition(input: {
  totalCm: number;
  defects: PartitionDefect[];
  lays: PartitionLay[];
  /** Closed-out remnants cut away from the roll — REMNANT cells. */
  remnants?: Array<{ id: string; number?: string | null; startCm: number; endCm: number }>;
}): PartitionRow[] {
  const total = input.totalCm;
  const rows: PartitionRow[] = [];
  const push = (start: number, end: number, type: SegmentType, refType?: string, refId?: string, label?: string) => {
    if (end - start <= 1e-6) return;
    rows.push({ startCm: round4(start), endCm: round4(end), type, refType, refId, label });
  };

  const laySegmentTypes = new Map<string, SegmentType>();
  const laySpans = new Map<string, { start: number; end: number }>();
  const remnantSpans = new Map<string, { start: number; end: number; number?: string | null }>();
  const events = new Set<number>([0, total]);
  for (const d of input.defects) {
    events.add(d.startCm);
    events.add(Math.min(d.endCm, total));
  }
  for (const lay of input.lays) {
    const s = lay.startCm;
    const e = Math.min(lay.endCm, total);
    if (e > s) {
      events.add(Math.max(0, s));
      events.add(e);
      laySegmentTypes.set(lay.id, lay.completed ? SegmentType.CONSUMED : SegmentType.RESERVED);
      laySpans.set(lay.id, { start: s, end: e });
    }
  }
  for (const r of input.remnants ?? []) {
    const s = Math.max(0, r.startCm);
    const e = Math.min(r.endCm, total);
    if (e > s) {
      events.add(s);
      events.add(e);
      remnantSpans.set(r.id, { start: s, end: e, number: r.number });
    }
  }

  const sorted = [...events].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (e - s <= 1e-6) continue;
    // Priority: LAY > REMNANT > DEFECT > AVAILABLE. A planned/active lay
    // placed inside a (shrinking) remnant span must still render as the
    // lay's own cell — the piece's AVAILABLE leftover is what remains
    // outside lay spans, so the timeline shows reservations truthfully.
    const lay = [...laySpans.entries()].find(
      ([, span]) => span.start <= s + 1e-6 && span.end >= e - 1e-6,
    );
    if (lay) {
      const [layId] = lay;
      push(s, e, laySegmentTypes.get(layId) ?? SegmentType.RESERVED, 'lay-plan', layId, `Lay ${layId.slice(0, 8)}`);
      continue;
    }
    const remnant = [...remnantSpans.entries()].find(
      ([, span]) => span.start <= s + 1e-6 && span.end >= e - 1e-6,
    );
    if (remnant) {
      const [remnantId, span] = remnant;
      push(s, e, SegmentType.REMNANT, 'remnant', remnantId, `Remnant ${span.number ?? ''}`.trim());
      continue;
    }
    const defect = input.defects.find(
      (d) => d.startCm <= s + 1e-6 && d.endCm >= e - 1e-6,
    );
    if (defect) {
      push(s, e, SegmentType.DEFECT, 'defect', defect.id, `Defect ${defect.code ?? ''}`.trim());
      continue;
    }
    push(s, e, SegmentType.AVAILABLE);
  }
  return rows;
}
