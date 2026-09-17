import { round4 } from './cutting';
import { toBase, CM_PER_INCH } from './cutting';
import { LengthUnit } from './enums';

/**
 * 4-Point Fabric Inspection System — the single authoritative scoring
 * implementation (used by the API when creating/updating inspections and by
 * the web form for live previews, so scores can never drift).
 *
 * ── Verified against the industry-standard 4-Point System ──────────────────
 *
 * 1. POINT ASSIGNMENT BY DEFECT SIZE (along the fabric length):
 *      defect length ≤ 3 in        → 1 point
 *      defect length > 3 and ≤ 6 in → 2 points
 *      defect length > 6 and ≤ 9 in → 3 points
 *      defect length > 9 in         → 4 points
 *    The largest penalty for any single defect is 4 points — even a full-width
 *    defect is capped at 4 (never more).
 *
 * 2. HOLES AND OPENINGS (the one standard exception to the size scale):
 *      any hole/opening scores the maximum 4 points regardless of its size.
 *
 * 3. LENGTH NORMALIZATION:
 *      points per 100 linear meters = totalPoints / lengthMeters × 100
 *      (the classic linear-unit formula — kept for reporting compatibility).
 *
 * 4. WIDTH NORMALIZATION (square-unit form):
 *      points per 100 square meters = totalPoints / (lengthM × widthM) × 100
 *      The penalty table above is unchanged, but the roll's measured WIDTH
 *      enters the score: the same number of defects on a narrower roll is
 *      worse, which is exactly what the width-aware form of the standard
 *      requires. Both figures are persisted; the DECISION uses the
 *      width-normalized (square meter) value.
 *
 * 5. ACCEPTANCE THRESHOLDS (on points per 100 m²):
 *      ≤ 15  → APPROVED (first quality)
 *      ≤ 30  → SECOND_QUALITY
 *      > 30  → REJECTED
 *
 * A defect entry may carry an explicit `points` value (1–4) recorded by the
 * inspector; when present it is honored (clamped to 1–4). Otherwise points
 * are derived from the defect size using the table above, with holes
 * overridden to 4.
 */

/** Maximum points a single defect can score (standard cap). */
export const MAX_DEFECT_POINTS = 4;

/** Holes/openings always score the maximum, regardless of size. */
export const HOLE_POINTS = 4;

/** Size brackets (inches) of the classic penalty table. */
export const POINT_SIZE_BRACKETS_IN = {
  /** ≤ 3 in → 1 point */
  onePointMaxIn: 3,
  /** ≤ 6 in → 2 points */
  twoPointMaxIn: 6,
  /** ≤ 9 in → 3 points */
  threePointMaxIn: 9,
} as const;

/** Acceptance thresholds on width-normalized points per 100 m². */
export const APPROVED_MAX_PTS_PER_100M2 = 15;
export const SECOND_QUALITY_MAX_PTS_PER_100M2 = 30;

/** Defect types treated as holes/openings (always 4 points). */
export const HOLE_DEFECT_TYPES = new Set(['HOLE', 'OPENING']);

export interface FourPointDefectInput {
  /** Defect length along the fabric, in the roll's length unit. */
  size?: number | null;
  /** Unit of `size` when it differs from the call-level sizeUnit. */
  sizeUnit?: LengthUnit | null;
  /** Already-scored points from the inspector (optional; clamped 1–4). */
  points?: number | null;
  /** Defect type code (e.g. 'HOLE', 'STAIN', 'OTHER'). */
  defectType?: string | null;
}

export interface FourPointScoreInput {
  defects: FourPointDefectInput[];
  /** Inspected roll length in the given length unit (defaults to cm). */
  lengthMeters: number;
  /** Roll width for the width-normalized score, in the given unit. */
  widthCm?: number | null;
  /** Unit the defect sizes are expressed in (default cm). */
  sizeUnit?: LengthUnit;
}

export interface FourPointScoreResult {
  /** Σ per-defect points (0–4 each). */
  totalPoints: number;
  /** Width-normalized score: points per 100 square meters. */
  pointsPer100SqMeters: number;
  /** Classic linear score: points per 100 linear meters (reporting only). */
  pointsPer100LinearMeters: number;
  /** qualityPct = max(0, 100 − pointsPer100SqMeters), capped at 100. */
  qualityPct: number;
  decision: 'APPROVED' | 'SECOND_QUALITY' | 'REJECTED';
}

/** Points for one defect from its size/type per the standard table. */
export function fourPointPoints(
  defect: FourPointDefectInput,
  sizeUnit: LengthUnit = LengthUnit.CM,
): number {
  if (defect.points != null && Number.isFinite(Number(defect.points))) {
    return Math.max(1, Math.min(MAX_DEFECT_POINTS, Math.round(Number(defect.points))));
  }
  if (defect.defectType && HOLE_DEFECT_TYPES.has(defect.defectType.toUpperCase())) {
    return HOLE_POINTS;
  }
  const size = Number(defect.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) return 1;
  const unit = defect.sizeUnit ?? sizeUnit;
  const inches = toBase(size, unit) / CM_PER_INCH;
  if (inches <= POINT_SIZE_BRACKETS_IN.onePointMaxIn) return 1;
  if (inches <= POINT_SIZE_BRACKETS_IN.twoPointMaxIn) return 2;
  if (inches <= POINT_SIZE_BRACKETS_IN.threePointMaxIn) return 3;
  return MAX_DEFECT_POINTS;
}

export function decideFourPoint(pointsPer100SqMeters: number): FourPointScoreResult['decision'] {
  if (pointsPer100SqMeters <= APPROVED_MAX_PTS_PER_100M2) return 'APPROVED';
  if (pointsPer100SqMeters <= SECOND_QUALITY_MAX_PTS_PER_100M2) return 'SECOND_QUALITY';
  return 'REJECTED';
}

/**
 * Score an inspection per the verified 4-point method (see module docs).
 * `lengthMeters` must be > 0; a degenerate width falls back to the linear
 * normalization (score equals pointsPer100LinearMeters) instead of dividing
 * by zero.
 */
export function scoreFourPoint(input: FourPointScoreInput): FourPointScoreResult {
  const sizeUnit = input.sizeUnit ?? LengthUnit.CM;
  const totalPoints = (input.defects ?? []).reduce((sum, d) => sum + fourPointPoints(d, sizeUnit), 0);
  const meters = Math.max(input.lengthMeters || 0, 0);
  const linearDenominator = Math.max(meters, 1);
  const pointsPer100LinearMeters = (totalPoints / linearDenominator) * 100;

  const widthMeters = input.widthCm && input.widthCm > 0 ? input.widthCm / 100 : null;
  const squareDenominator = widthMeters ? Math.max(meters * widthMeters, 1) : null;
  const pointsPer100SqMeters = squareDenominator
    ? (totalPoints / squareDenominator) * 100
    : pointsPer100LinearMeters;

  const cappedLinear = Math.min(pointsPer100LinearMeters, 100);
  const cappedSq = Math.min(pointsPer100SqMeters, 100);
  return {
    totalPoints,
    pointsPer100SqMeters: round4(pointsPer100SqMeters),
    pointsPer100LinearMeters: round4(pointsPer100LinearMeters),
    qualityPct: round4(Math.max(0, 100 - cappedSq)),
    // Keep the exact capped value used for the decision visible to callers.
    decision: decideFourPoint(cappedSq),
  };
}
