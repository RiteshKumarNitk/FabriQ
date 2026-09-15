/**
 * Unit check of computeViolations/rotatedBounds (the canvas's pure geometry
 * module) against the exact stress fixture + edge cases.
 *
 * Run: npx ts-node -O '{"module":"commonjs","esModuleInterop":true}' apps/web/test/marker-geometry.test.ts
 */
import assert from 'node:assert';
import { computeViolations, rotatedBounds } from '../src/components/cutting/marker-geometry';

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.error(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// The EXACT stress fixture: 3 rows x 70 cols of 10.5x37 pieces + OUTSIDE.
const N = 210;
const ROWS = 3;
const COLS = Math.ceil((N - 1) / ROWS);
const pieces = [];
for (let i = 0; i < N - 1; i++) {
  const col = Math.floor(i / ROWS);
  const row = i % ROWS;
  pieces.push({ id: `p${i}`, name: `P${i}`, xCm: col * 11, yCm: row * 38, widthCm: 10.5, heightCm: 37, rotationDeg: 0 });
}
pieces.push({ id: 'outside', name: 'OUTSIDE', xCm: 0, yCm: 150, widthCm: 10.5, heightCm: 37, rotationDeg: 0 });

// Marker length as the server derives it: last column ends at 69*11+10.5 =
// 769.5 cm, + endAllowance 2 → 771.5. (A shorter constant would falsely flag
// the last column as out-of-bounds — as an earlier draft of this test did.)
const LENGTH_CM = 69 * 11 + 10.5 + 2;
const violations = computeViolations(pieces, 143.51, LENGTH_CM, []);
const outside = violations.get('outside');
ok('OUTSIDE flagged width', !!outside?.width, JSON.stringify(outside));
ok('OUTSIDE not flagged overlap/defect', !!outside && !outside.overlap && !outside.defect, JSON.stringify(outside));
const packedBad = pieces.filter((p) => {
  if (p.id === 'outside') return false; // deliberately out of bounds
  const v = violations.get(p.id);
  return v && (v.width || v.overlap || v.defect);
});
ok('no packed piece flagged (sweep finds zero overlaps in the grid)', packedBad.length === 0, `${packedBad.length} flagged: ${packedBad.slice(0, 3).map((p) => p.id).join(',')}`);

// Sweep equivalence vs the naive O(n²) on a random-ish dense layout.
const dense = Array.from({ length: 80 }, (_, i) => ({
  id: `d${i}`,
  name: `D${i}`,
  xCm: (i * 13) % 150,
  yCm: (i * 29) % 140,
  widthCm: 20 + (i % 5) * 3,
  heightCm: 15 + (i % 7) * 4,
  rotationDeg: [0, 90, 45][i % 3],
}));
const sweep = computeViolations(dense, 143.51, 400, []);
let naiveOverlap = new Set<string>();
for (const a of dense) {
  for (const b of dense) {
    if (a.id === b.id) continue;
    const ra = rotatedBounds(a);
    const rb = rotatedBounds(b);
    if (ra.x0 < rb.x1 - 1e-6 && rb.x0 < ra.x1 - 1e-6 && ra.y0 < rb.y1 - 1e-6 && rb.y0 < ra.y1 - 1e-6) {
      naiveOverlap.add(a.id);
      naiveOverlap.add(b.id);
    }
  }
}
const sweepOverlap = new Set([...sweep.entries()].filter(([, v]) => v.overlap).map(([id]) => id));
ok('sweep overlap set === naive O(n²) set on a dense rotated layout', sweepOverlap.size === naiveOverlap.size && [...sweepOverlap].every((id) => naiveOverlap.has(id)), `sweep ${sweepOverlap.size} vs naive ${naiveOverlap.size}`);

// Width/defect edges.
const w = computeViolations([{ id: 'a', name: 'A', xCm: 0, yCm: -1, widthCm: 10, heightCm: 5, rotationDeg: 0 }], 143.51, 400, []);
ok('negative y flagged as width violation', w.get('a')?.width === true);
const dfl = computeViolations([{ id: 'a', name: 'A', xCm: 0, yCm: 0, widthCm: 10, heightCm: 20, rotationDeg: 0 }], 143.51, 400, [{ startCm: 5, endCm: 9, affectedWidthCm: 143.51 }]);
ok('piece over defect band flagged', dfl.get('a')?.defect === true);

// Rotated bounds sanity.
const rb = rotatedBounds({ id: 'r', name: 'R', xCm: 0, yCm: 0, widthCm: 30, heightCm: 10, rotationDeg: 90 });
ok('90° rotation swaps extents', Math.abs(rb.x1 - rb.x0 - 10) < 1e-9 && Math.abs(rb.y1 - rb.y0 - 30) < 1e-9, `w=${rb.x1 - rb.x0} h=${rb.y1 - rb.y0}`);

console.log(`\nmarker-geometry: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
