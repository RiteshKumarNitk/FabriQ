/**
 * Size-wise production fulfillment tests (task §16).
 *
 * Proves actual quantities are DERIVED from completed cutting records via the
 * marker's size mix — never copied from planned values — and that planned =
 * ratio × ply.
 */
import * as assert from 'node:assert';
import { sizeWiseFulfillment } from '../src/production';

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

console.log('Size-wise fulfillment tests');

ok('planned = ratio × ply; short/excess vs required', () => {
  const rows = sizeWiseFulfillment(
    { S: 100, M: 150, L: 200, XL: 100 },
    [{ ply: 40, sizeRatio: { S: 1, M: 2, L: 3, XL: 1 } }],
  );
  assert.deepStrictEqual(rows.S, { required: 100, planned: 40, actual: 0, short: 60, excess: 0 });
  assert.deepStrictEqual(rows.M, { required: 150, planned: 80, actual: 0, short: 70, excess: 0 });
  assert.deepStrictEqual(rows.L, { required: 200, planned: 120, actual: 0, short: 80, excess: 0 });
  assert.deepStrictEqual(rows.XL, { required: 100, planned: 40, actual: 0, short: 60, excess: 0 });
});

ok('actual derives from completed cuts through the size mix — never copied from planned', () => {
  // Marker M2/L2/XL1 (5 garments), 40 ply, actual 200 sets cut.
  const rows = sizeWiseFulfillment(
    { M: 100, L: 80, XL: 20 },
    [{ ply: 40, sizeRatio: { M: 2, L: 2, XL: 1 }, cutOperations: [{ status: 'COMPLETED', actualPieces: 200 }] }],
  );
  assert.strictEqual(rows.M.planned, 80);
  assert.strictEqual(rows.L.planned, 80);
  assert.strictEqual(rows.XL.planned, 40);
  assert.strictEqual(rows.M.actual, 80); // 2/5 × 200
  assert.strictEqual(rows.L.actual, 80);
  assert.strictEqual(rows.XL.actual, 40);
  // Deliberately different from planned to prove derivation, not copying.
  const rows2 = sizeWiseFulfillment(
    { M: 100, L: 80, XL: 20 },
    [{ ply: 40, sizeRatio: { M: 2, L: 2, XL: 1 }, cutOperations: [{ status: 'COMPLETED', actualPieces: 150 }] }],
  );
  assert.strictEqual(rows2.M.actual, 60);
  assert.strictEqual(rows2.L.actual, 60);
  assert.strictEqual(rows2.XL.actual, 30);
});

ok('incomplete lays add nothing to actual; cancelled lays count for nothing at all', () => {
  const rows = sizeWiseFulfillment(
    { M: 50 },
    [
      { ply: 10, sizeRatio: { M: 5 }, status: 'CANCELLED', cutOperations: [{ status: 'COMPLETED', actualPieces: 50 }] },
      { ply: 10, sizeRatio: { M: 5 }, cutOperations: [{ status: 'PENDING' }] },
    ],
  );
  // The cancelled lay is excluded entirely; the pending lay still counts as
  // planned (ratio × ply) but contributes no actual.
  assert.strictEqual(rows.M.planned, 50);
  assert.strictEqual(rows.M.actual, 0);
});

ok('rejected pieces are not counted as output (only actualPieces is)', () => {
  const rows = sizeWiseFulfillment(
    { M: 50 },
    [{ ply: 10, sizeRatio: { M: 5 }, cutOperations: [{ status: 'COMPLETED', actualPieces: 48 }] }],
  );
  assert.strictEqual(rows.M.actual, 48);
});

ok('excess planned shows when lays overshoot the requirement', () => {
  const rows = sizeWiseFulfillment({ M: 100 }, [{ ply: 40, sizeRatio: { M: 5 } }]);
  assert.strictEqual(rows.M.planned, 200);
  assert.strictEqual(rows.M.excess, 100);
  assert.strictEqual(rows.M.short, 0);
});

ok('sizes present only in markers appear (union of required + marker sizes)', () => {
  const rows = sizeWiseFulfillment({ M: 100 }, [{ ply: 1, sizeRatio: { M: 1, XXL: 1 } }]);
  assert.ok(rows.M && rows.XXL);
  assert.strictEqual(rows.XXL.required, 0);
  assert.strictEqual(rows.XXL.planned, 1);
});

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
if (process.exitCode) process.exit(1);
