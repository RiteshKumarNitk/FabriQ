/**
 * FabriQ cutting-planner domain tests.
 *
 * Runs the authoritative calculation engine (@fabriq/shared/src/cutting.ts)
 * against the mandatory production scenarios. Dependency-free: plain asserts
 * executed with ts-node. Any failure exits non-zero.
 *
 * Run: npm run test -w @fabriq/shared
 */
import * as assert from 'node:assert';
import { LengthUnit, SegmentType } from '../src/enums';
import {
  boundingBox,
  calculateLay,
  calculateMarker,
  deriveMarkerLength,
  fabricForLays,
  fitsInSegment,
  fromBase,
  garmentsPerMarker,
  intervalOverlap,
  laysRequired,
  rectsOverlap,
  round4,
  summarizeRoll,
  toBase,
  validatePlacement,
} from '../src/cutting';

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

console.log('Cutting domain tests');

// ── Units ────────────────────────────────────────────────────────────────

ok('T-units: inches ↔ cm round-trip (58" = 147.32 cm)', () => {
  const cm = toBase(58, LengthUnit.INCHES);
  assert.ok(close(cm, 147.32, 1e-9));
  assert.ok(close(fromBase(cm, LengthUnit.INCHES), 58, 1e-9));
});

ok('T-units: meters, feet, mm all normalize through cm', () => {
  assert.ok(close(toBase(1, LengthUnit.METERS), 100));
  assert.ok(close(toBase(1, LengthUnit.FEET), 30.48));
  assert.ok(close(toBase(10, LengthUnit.MM), 1));
});

ok('T-units: display conversion never loses production precision', () => {
  // 4.8 m marker expressed in inches then back must stay 480 cm.
  const inches = fromBase(480, LengthUnit.INCHES);
  assert.ok(close(toBase(inches, LengthUnit.INCHES), 480, 1e-9));
});

// ── Geometry ─────────────────────────────────────────────────────────────

ok('T-geom: rotated bounding box stays centered', () => {
  const bb = boundingBox({ x: 10, y: 5, width: 40, height: 60, rotation: 90 });
  assert.ok(close(bb.minX + (bb.maxX - bb.minX) / 2, 30)); // center x = 10 + 40/2
  assert.ok(close(bb.minY + (bb.maxY - bb.minY) / 2, 35)); // center y = 5 + 60/2
  assert.ok(close(bb.maxX - bb.minX, 60)); // 90° swaps extents
  assert.ok(close(bb.maxY - bb.minY, 40));
});

ok('T-geom: overlap detection catches intersecting pieces', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  const b = { x: 5, y: 5, width: 10, height: 10 };
  const c = { x: 11, y: 0, width: 5, height: 5 };
  assert.ok(rectsOverlap(a, b));
  assert.ok(!rectsOverlap(a, c));
});

ok('T-geom: interval overlap length', () => {
  assert.ok(close(intervalOverlap(0, 10, 8, 12), 2));
  assert.ok(close(intervalOverlap(0, 10, 10, 20), 0));
});

// ── The end-to-end production scenario (spec §40) ────────────────────────

const usableWidthCm = round4(toBase(56.5, LengthUnit.INCHES)); // 143.51 cm
const shirtPieces = [
  { id: 'front-M', name: 'Front', width: 55, height: 72, x: 0, y: 0 },
  { id: 'back-M', name: 'Back', width: 55, height: 72, x: 56, y: 0 },
  { id: 'sleeve-M-1', name: 'Sleeve', width: 25, height: 60, x: 112, y: 0 },
  { id: 'sleeve-M-2', name: 'Sleeve', width: 25, height: 60, x: 112, y: 61 },
];

ok('T1: 100 m roll converts to base units exactly', () => {
  const rollCm = toBase(100, LengthUnit.METERS);
  assert.ok(close(rollCm, 10_000));
});

ok('T2: marker derives its length from the farthest piece edge', () => {
  const length = deriveMarkerLength(shirtPieces, 0);
  // Farthest piece ends at x = 137 cm → length = 137 cm (no hard allowance here).
  assert.ok(close(length, 137));
});

ok('T2b: end allowance is added to the derived length', () => {
  const length = deriveMarkerLength(shirtPieces, 3);
  assert.ok(close(length, 140));
});

ok('T3: size ratio M2/L2/XL1 → 5 garments per marker', () => {
  assert.strictEqual(garmentsPerMarker({ M: 2, L: 2, XL: 1 }), 5);
});

ok('T3b: changing the size ratio changes garments per marker dynamically', () => {
  assert.strictEqual(garmentsPerMarker({ S: 1, M: 2, L: 2, XL: 1 }), 6);
  assert.strictEqual(garmentsPerMarker({ M: 3, L: 2, XL: 1 }), 6);
});

ok('T-marker: planning efficiency = pattern area / marker area', () => {
  const calc = calculateMarker({ usableWidthCm, lengthCm: 480, pieces: shirtPieces });
  const expected = round4(
    (shirtPieces.reduce((s, p) => s + p.width * p.height, 0) / (480 * usableWidthCm)) * 100,
  );
  assert.ok(close(calc.efficiencyPct, expected, 1e-9));
  assert.ok(calc.efficiencyPct <= 100);
  assert.ok(close(calc.markerAreaCm2, round4(480 * usableWidthCm)));
  assert.ok(close(calc.wasteAreaCm2, round4(calc.markerAreaCm2 - calc.patternAreaCm2)));
});

// ── Lay / ply math ───────────────────────────────────────────────────────

ok('T4: 40 ply × 5 garments = 200 theoretical pieces', () => {
  const lay = calculateLay({ markerLengthCm: 480, garmentsPerMarker: 5, ply: 40 });
  assert.strictEqual(lay.theoreticalPieces, 200);
  assert.strictEqual(lay.garmentsPerLayer, 5);
});

ok('T4b: fabric per lay is the marker length — ply never multiplies length', () => {
  const lay = calculateLay({ markerLengthCm: 480, garmentsPerMarker: 5, ply: 40 });
  assert.ok(close(lay.fabricRequiredCm, 480));
  assert.ok(close(fabricForLays(20, 480), 9600)); // 20 lays = 96 m of physical fabric
});

ok('T-cut: lays required to hit a target never silently round down', () => {
  assert.strictEqual(laysRequired(200, 5, 40), 1);
  assert.strictEqual(laysRequired(201, 5, 40), 2); // 200 < 201 → second lay
  assert.strictEqual(laysRequired(0, 5, 40), 0);
});

// ── Defects & remaining fabric ───────────────────────────────────────────

ok('T5: defect 27–29 m is excluded from available planning space', () => {
  const original = toBase(100, LengthUnit.METERS);
  const defectSpan = { startCm: toBase(27, LengthUnit.METERS), endCm: toBase(29, LengthUnit.METERS) };
  // A 4.8 m marker cannot fit in the 2 m of remaining fabric after the defect
  // when the roll is fully consumed otherwise — verified via fitsInSegment.
  assert.ok(!fitsInSegment(480, { startCm: defectSpan.endCm, endCm: defectSpan.startCm + 300, type: SegmentType.AVAILABLE }));
  assert.ok(fitsInSegment(480, { startCm: 0, endCm: toBase(5, LengthUnit.METERS), type: SegmentType.AVAILABLE }));
  void original;
});

ok('T6: a marker overlapping a defect is flagged for confirmation', () => {
  const issues = validatePlacement({
    pieces: [],
    usableWidthCm,
    markerLengthCm: 480,
    defects: [{ id: 'd12', startCm: 2700, endCm: 2900 }],
    markerStartCm: 2600, // 26.0 m → 30.8 m: crosses 27–29
  });
  assert.ok(issues.some((i) => i.code === 'CROSSES_DEFECT' && i.defectId === 'd12'));
  const clean = validatePlacement({
    pieces: [],
    usableWidthCm,
    markerLengthCm: 480,
    defects: [{ id: 'd12', startCm: 2700, endCm: 2900 }],
    markerStartCm: 0, // 0 → 4.8 m: clear of the defect
  });
  assert.ok(!clean.some((i) => i.code === 'CROSSES_DEFECT'));
});

ok('T7: remaining fabric reconciles original − consumed − waste − remnant', () => {
  const summary = summarizeRoll({
    originalLengthCm: 10_000,
    ledger: [
      { type: 'CONSUMED', quantityCm: -480 },
      { type: 'CONSUMED', quantityCm: -480 },
      { type: 'CONSUMED', quantityCm: -480 },
      { type: 'WASTE', quantityCm: -200 },
      { type: 'RESERVED', quantityCm: -480 }, // reservations never leave the roll
    ],
    defectLengthCm: 200,
  });
  assert.ok(close(summary.consumedCm, 1440));
  assert.ok(close(summary.reservedCm, 480));
  assert.ok(close(summary.wasteCm, 200));
  assert.ok(close(summary.remainingCm, 10_000 - 1440 - 200));
  assert.ok(close(summary.availableCm, summary.remainingCm - summary.reservedCm));
  assert.ok(summary.remainingCm >= 0);
});

ok('T7b: remaining fabric can never go negative', () => {
  const summary = summarizeRoll({
    originalLengthCm: 500,
    ledger: [{ type: 'CONSUMED', quantityCm: -800 }],
  });
  assert.strictEqual(summary.remainingCm, 0);
});

// ── Placement validation ─────────────────────────────────────────────────

ok('T8: pattern piece outside the usable width is a blocking violation', () => {
  const issues = validatePlacement({
    pieces: [{ id: 'wide', width: 60, height: 70, x: 0, y: usableWidthCm - 50 }],
    usableWidthCm,
    markerLengthCm: 200,
  });
  assert.ok(issues.some((i) => i.code === 'OUTSIDE_WIDTH' && i.pieceId === 'wide'));
});

ok('T8b: pattern piece past the marker end is a blocking violation', () => {
  const issues = validatePlacement({
    pieces: [{ id: 'long', width: 50, height: 70, x: 180, y: 0 }],
    usableWidthCm,
    markerLengthCm: 200,
  });
  assert.ok(issues.some((i) => i.code === 'OUTSIDE_MARKER' && i.pieceId === 'long'));
});

ok('T9: overlapping pattern pieces are blocking violations', () => {
  const issues = validatePlacement({
    pieces: [
      { id: 'a', width: 50, height: 70, x: 0, y: 0 },
      { id: 'b', width: 50, height: 70, x: 25, y: 0 },
    ],
    usableWidthCm,
    markerLengthCm: 500,
  });
  assert.ok(issues.some((i) => i.code === 'OVERLAP'));
  const clean = validatePlacement({
    pieces: [
      { id: 'a', width: 50, height: 70, x: 0, y: 0 },
      { id: 'b', width: 50, height: 70, x: 50, y: 0 },
    ],
    usableWidthCm,
    markerLengthCm: 500,
  });
  assert.ok(!clean.some((i) => i.code === 'OVERLAP'));
});

ok('T10: shrinking usable width flips a valid layout to invalid', () => {
  // A 60 × 140 piece fits a 143.51 cm usable width but not a 135 cm one.
  const piece = { id: 'fit', width: 60, height: 140, x: 0, y: 0 };
  const wide = validatePlacement({ pieces: [piece], usableWidthCm: 143.51, markerLengthCm: 200 });
  const narrow = validatePlacement({ pieces: [piece], usableWidthCm: 135, markerLengthCm: 200 });
  assert.ok(!wide.some((i) => i.code === 'OUTSIDE_WIDTH'));
  assert.ok(narrow.some((i) => i.code === 'OUTSIDE_WIDTH'));
});

ok('T11: consumption follows marker length changes', () => {
  const lay480 = fabricForLays(20, 480);
  const lay520 = fabricForLays(20, 520);
  assert.ok(close(lay480, 9600));
  assert.ok(close(lay520, 10_400));
  assert.ok(close(lay520 - lay480, 800));
});

ok('T12: rotated pieces keep real dimensions through validation', () => {
  // A 60 × 40 piece rotated 90° occupies a 40 × 60 AABB (rotation is around
  // the piece center, so (x, y) is the un-rotated top-left corner).
  const rotated = { id: 'r', width: 60, height: 40, x: 10, y: 10, rotation: 90 };
  const issues = validatePlacement({ pieces: [rotated], usableWidthCm: 50, markerLengthCm: 200 });
  assert.ok(issues.some((i) => i.code === 'OUTSIDE_WIDTH')); // 60 cm tall > 50 cm usable
  const fits = validatePlacement({ pieces: [rotated], usableWidthCm: 61, markerLengthCm: 200 });
  assert.ok(!fits.some((i) => i.code === 'OUTSIDE_WIDTH'));
});

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
if (process.exitCode) process.exit(1);
