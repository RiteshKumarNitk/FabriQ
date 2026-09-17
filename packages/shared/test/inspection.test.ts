/**
 * 4-point inspection scoring tests (task §3).
 *
 * Verifies the size-based point table, hole override, length AND width
 * normalization, and the acceptance thresholds — including boundary values.
 */
import * as assert from 'node:assert';
import {
  fourPointPoints,
  scoreFourPoint,
  decideFourPoint,
  APPROVED_MAX_PTS_PER_100M2,
  SECOND_QUALITY_MAX_PTS_PER_100M2,
} from '../src/inspection';
import { LengthUnit } from '../src/enums';

let passed = 0;
function ok(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    console.error(`  ✘ ${name}`);
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
function close(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

console.log('4-point inspection tests');

// ── point assignment ─────────────────────────────────────────────────────

ok('small defect (≤ 3 in) → 1 point', () => {
  assert.strictEqual(fourPointPoints({ size: 2, sizeUnit: LengthUnit.INCHES }), 1);
  assert.strictEqual(fourPointPoints({ size: 3, sizeUnit: LengthUnit.INCHES }), 1);
});

ok('medium defect (> 3–6 in) → 2 points', () => {
  assert.strictEqual(fourPointPoints({ size: 4, sizeUnit: LengthUnit.INCHES }), 2);
  assert.strictEqual(fourPointPoints({ size: 6, sizeUnit: LengthUnit.INCHES }), 2);
});

ok('large defect (> 6–9 in) → 3 points', () => {
  assert.strictEqual(fourPointPoints({ size: 7, sizeUnit: LengthUnit.INCHES }), 3);
  assert.strictEqual(fourPointPoints({ size: 9, sizeUnit: LengthUnit.INCHES }), 3);
});

ok('defect > 9 in → 4 points (the cap)', () => {
  assert.strictEqual(fourPointPoints({ size: 9.5, sizeUnit: LengthUnit.INCHES }), 4);
  assert.strictEqual(fourPointPoints({ size: 200, sizeUnit: LengthUnit.INCHES }), 4);
});

ok('hole/opening scores 4 points regardless of size', () => {
  assert.strictEqual(fourPointPoints({ defectType: 'HOLE', size: 1, sizeUnit: LengthUnit.INCHES }), 4);
  assert.strictEqual(fourPointPoints({ defectType: 'HOLE', size: 0.25, sizeUnit: LengthUnit.INCHES }), 4);
  assert.strictEqual(fourPointPoints({ defectType: 'OPENING', size: 0.1, sizeUnit: LengthUnit.INCHES }), 4);
});

ok('explicit inspector points are honored and clamped to 1–4', () => {
  assert.strictEqual(fourPointPoints({ points: 2 }), 2);
  assert.strictEqual(fourPointPoints({ points: 4, defectType: 'HOLE' }), 4);
  assert.strictEqual(fourPointPoints({ points: 9 }), 4);
  assert.strictEqual(fourPointPoints({ points: 0 }), 1);
});

ok('defect sizes convert from cm into the inch table', () => {
  // 7.62 cm = 3 in → boundary of the 1-point bracket.
  assert.strictEqual(fourPointPoints({ size: 7.62 }), 1);
  // 10.16 cm = 4 in → 2 points.
  assert.strictEqual(fourPointPoints({ size: 10.16 }), 2);
});

ok('unknown/zero size defaults to 1 point (smallest penalty)', () => {
  assert.strictEqual(fourPointPoints({}), 1);
  assert.strictEqual(fourPointPoints({ size: 0 }), 1);
});

// ── normalization ────────────────────────────────────────────────────────

ok('100 m roll, 10 defects × 2 pts → 20 pts/100 m linear', () => {
  const s = scoreFourPoint({
    defects: Array.from({ length: 10 }, () => ({ size: 4, sizeUnit: LengthUnit.INCHES })),
    lengthMeters: 100,
  });
  assert.ok(close(s.totalPoints, 20));
  assert.ok(close(s.pointsPer100LinearMeters, 20));
  // No width given → square score falls back to linear.
  assert.ok(close(s.pointsPer100SqMeters, 20));
  assert.strictEqual(s.decision, 'SECOND_QUALITY');
});

ok('width normalization: same defects on a narrower roll score worse', () => {
  const defects = Array.from({ length: 10 }, () => ({ size: 4, sizeUnit: LengthUnit.INCHES }));
  const wide = scoreFourPoint({ defects, lengthMeters: 100, widthCm: 150 });
  const narrow = scoreFourPoint({ defects, lengthMeters: 100, widthCm: 100 });
  assert.ok(close(wide.pointsPer100SqMeters, 20 * (100 / 150), 1e-3));
  assert.ok(close(narrow.pointsPer100SqMeters, 20 * (100 / 100), 1e-3));
  assert.ok(narrow.pointsPer100SqMeters > wide.pointsPer100SqMeters);
});

ok('quality = max(0, 100 − pts/100 m²) and is capped at 100', () => {
  const clean = scoreFourPoint({ defects: [], lengthMeters: 100, widthCm: 120 });
  assert.ok(close(clean.qualityPct, 100));
  assert.strictEqual(clean.decision, 'APPROVED');
  const heavy = scoreFourPoint({
    defects: Array.from({ length: 50 }, () => ({ size: 12, sizeUnit: LengthUnit.INCHES })),
    lengthMeters: 100,
    widthCm: 100,
  }); // 200 pts / 100 m²
  assert.ok(close(heavy.qualityPct, 0));
  assert.strictEqual(heavy.decision, 'REJECTED');
});

// ── decision boundaries ──────────────────────────────────────────────────

ok('decision thresholds: ≤15 approved, ≤30 second, >30 rejected (boundaries inclusive)', () => {
  assert.strictEqual(decideFourPoint(0), 'APPROVED');
  assert.strictEqual(decideFourPoint(15), 'APPROVED');
  assert.strictEqual(decideFourPoint(15.01), 'SECOND_QUALITY');
  assert.strictEqual(decideFourPoint(30), 'SECOND_QUALITY');
  assert.strictEqual(decideFourPoint(30.01), 'REJECTED');
  assert.strictEqual(APPROVED_MAX_PTS_PER_100M2, 15);
  assert.strictEqual(SECOND_QUALITY_MAX_PTS_PER_100M2, 30);
});

ok('width normalization flips a marginal roll (worked example)', () => {
  // 40 pts on a 100 m × 1 m strip → 40 pts/100 m² → REJECTED.
  const defects = Array.from({ length: 20 }, () => ({ size: 4, sizeUnit: LengthUnit.INCHES }));
  const linear = scoreFourPoint({ defects, lengthMeters: 100, widthCm: 100 });
  assert.ok(close(linear.pointsPer100SqMeters, 40, 1e-3));
  assert.strictEqual(linear.decision, 'REJECTED');
  // The SAME defects on a 1.4 m-wide roll: 40 / (100 × 1.4) × 100 ≈ 28.57
  // → the width normalization rescues it to SECOND_QUALITY.
  const wider = scoreFourPoint({ defects, lengthMeters: 100, widthCm: 140 });
  assert.ok(close(wider.pointsPer100SqMeters, 28.5714, 1e-3));
  assert.strictEqual(wider.decision, 'SECOND_QUALITY');
});

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
if (process.exitCode) process.exit(1);
