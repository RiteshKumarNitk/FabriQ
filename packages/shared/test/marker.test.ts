/**
 * Marker calculation edge-case tests (task §12).
 *
 * Zero pieces, one piece, multiple pieces, rotated pieces, overlapping
 * pieces, outside-width/outside-marker pieces, defect crossing, different
 * widths and marker lengths.
 */
import * as assert from 'node:assert';
import {
  boundingBox,
  calculateLay,
  calculateMarker,
  deriveMarkerLength,
  garmentsPerMarker,
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

console.log('Marker calculation tests');

ok('zero pieces → zero length/areas, no crash', () => {
  const calc = calculateMarker({ usableWidthCm: 140, pieces: [] });
  assert.strictEqual(calc.lengthCm, 0);
  assert.strictEqual(calc.markerAreaCm2, 0);
  assert.strictEqual(calc.patternAreaCm2, 0);
  assert.strictEqual(calc.efficiencyPct, 0);
  assert.strictEqual(garmentsPerMarker({}), 0);
});

ok('one piece: length = piece end + allowance, efficiency exact', () => {
  // width runs along the marker length (x), height across the width (y).
  const pieces = [{ id: 'a', width: 70, height: 60, x: 0, y: 0 }];
  const calc = calculateMarker({ usableWidthCm: 140, endAllowanceCm: 2, pieces });
  assert.ok(close(calc.lengthCm, 72));
  assert.ok(close(calc.patternAreaCm2, 4_200));
  assert.ok(close(calc.markerAreaCm2, 72 * 140));
  assert.ok(close(calc.efficiencyPct, (4_200 / (72 * 140)) * 100, 1e-3));
  const lay = calculateLay({ markerLengthCm: calc.lengthCm, garmentsPerMarker: 1, ply: 10 });
  assert.strictEqual(lay.theoreticalPieces, 10);
  assert.ok(close(lay.fabricRequiredCm, 72));
});

ok('rotated pieces: AABB via center rotation feeds length and width checks', () => {
  const piece = { id: 'r', width: 30, height: 100, x: 100, y: 20, rotation: 90 };
  const bb = boundingBox(piece);
  assert.ok(close(bb.maxX - bb.minX, 100));
  assert.ok(close(bb.maxY - bb.minY, 30));
  // Center = (115, 70); rotated AABB spans x 65→165, y 55→85.
  const calc = calculateMarker({ usableWidthCm: 90, pieces: [piece] });
  assert.ok(close(calc.lengthCm, 165, 1e-4));
});

ok('overlap + outside bounds are the only blocking finalize violations', () => {
  const pieces = [
    { id: 'a', width: 50, height: 70, x: 0, y: 0 },
    { id: 'b', width: 50, height: 70, x: 20, y: 0 }, // overlaps a
    { id: 'c', width: 50, height: 70, x: 100, y: 999 }, // outside width
  ];
  const issues = validatePlacement({ pieces, usableWidthCm: 140, markerLengthCm: 200 });
  assert.ok(issues.some((i) => i.code === 'OVERLAP' && i.pieceId === 'a' && i.otherPieceId === 'b'));
  assert.ok(issues.some((i) => i.code === 'OUTSIDE_WIDTH' && i.pieceId === 'c'));
  // Outside marker end:
  const issues2 = validatePlacement({
    pieces: [{ id: 'd', width: 50, height: 70, x: 190, y: 0 }],
    usableWidthCm: 140,
    markerLengthCm: 200,
  });
  assert.ok(issues2.some((i) => i.code === 'OUTSIDE_MARKER' && i.pieceId === 'd'));
});

ok('defect crossing is a surfaced warning with the defect id', () => {
  const issues = validatePlacement({
    pieces: [{ id: 'p', width: 50, height: 70, x: 0, y: 0 }],
    usableWidthCm: 140,
    markerLengthCm: 100,
    defects: [{ id: 'd9', startCm: 80, endCm: 90 }],
    markerStartCm: 50,
  });
  assert.ok(issues.some((i) => i.code === 'CROSSES_DEFECT' && i.defectId === 'd9'));
});

ok('different marker widths and lengths produce exact areas', () => {
  const pieces = [{ id: 'a', width: 100, height: 100, x: 0, y: 0 }]; // maxX = 100
  for (const w of [110, 143.51, 200]) {
    const calc = calculateMarker({ usableWidthCm: w, lengthCm: 120, pieces });
    assert.ok(close(calc.markerAreaCm2, 120 * w));
    assert.ok(close(calc.efficiencyPct, (10_000 / (120 * w)) * 100, 1e-3));
  }
});

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
if (process.exitCode) process.exit(1);
