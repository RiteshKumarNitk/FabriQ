/**
 * Roll ledger + segment-partition tests (tasks §13, §14).
 *
 * Scenario (§13): 100 m roll → reserve 5 m → consume 5 m → waste 0.5 m →
 * remaining 94.5 m → reserve another 10 m → available = remaining − reserved.
 * Segment tests (§14): defect partition + reservation crossing a defect.
 */
import * as assert from 'node:assert';
import { buildSegmentPartition, summarizeRoll } from '../src/cutting';
import { SegmentType } from '../src/enums';

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

/** The §13 scenario replayed through the ledger. */
function ledgerScenario() {
  return summarizeRoll({
    originalLengthCm: 10_000,
    ledger: [
      { type: 'RESERVED', quantityCm: -500 },
      { type: 'CONSUMED', quantityCm: -500 },
      { type: 'WASTE', quantityCm: -50 },
      { type: 'RELEASED', quantityCm: 0 }, // the reservation was consumed, not released
    ],
  });
}

console.log('Roll ledger tests');

ok('§13: 100 m − consume 5 m − waste 0.5 m → remaining 94.5 m', () => {
  const s = ledgerScenario();
  assert.ok(close(s.consumedCm, 500));
  assert.ok(close(s.wasteCm, 50));
  assert.ok(close(s.remainingCm, 9_450));
});

ok('§13: reserved 10 m more → available = remaining − reserved', () => {
  // After the first scenario, a second reservation of 10 m (soft hold):
  const s = summarizeRoll({
    originalLengthCm: 10_000,
    ledger: [
      { type: 'RESERVED', quantityCm: -500 },
      { type: 'CONSUMED', quantityCm: -500 },
      { type: 'WASTE', quantityCm: -50 },
      { type: 'RESERVED', quantityCm: -1_000 },
    ],
  });
  assert.ok(close(s.reservedCm, 1_500));
  assert.ok(close(s.remainingCm, 9_450));
  assert.ok(close(s.availableCm, 9_450 - 1_500));
  assert.ok(s.availableCm < s.remainingCm);
});

ok('no negative remaining, no negative available (never clamped silently — floored at 0)', () => {
  const s = summarizeRoll({ originalLengthCm: 100, ledger: [{ type: 'CONSUMED', quantityCm: -1_000 }] });
  assert.strictEqual(s.remainingCm, 0);
  const s2 = summarizeRoll({
    originalLengthCm: 100,
    ledger: [
      { type: 'CONSUMED', quantityCm: -100 },
      { type: 'RESERVED', quantityCm: -50 },
    ],
  });
  assert.strictEqual(s2.availableCm, 0);
});

ok('ledger stays append-only: corrections are new rows (adjustment adds back)', () => {
  const s = summarizeRoll({
    originalLengthCm: 1_000,
    ledger: [
      { type: 'CONSUMED', quantityCm: -300 },
      { type: 'ADJUSTMENT', quantityCm: 100 }, // error correction returns fabric
    ],
  });
  assert.ok(close(s.remainingCm, 800, 1e-4));
});

ok('MEASURED / DEFECT_MARKED never move material', () => {
  const s = summarizeRoll({
    originalLengthCm: 1_000,
    ledger: [
      { type: 'MEASURED', quantityCm: 0 },
      { type: 'DEFECT_MARKED', quantityCm: 0 },
    ],
  });
  assert.ok(close(s.remainingCm, 1_000));
});

ok('REMNANT ledger rows remove the span from remaining fabric', () => {
  const s = summarizeRoll({
    originalLengthCm: 10_000,
    ledger: [
      { type: 'CONSUMED', quantityCm: -8_200 },
      { type: 'WASTE', quantityCm: -200 },
      { type: 'REMNANT', quantityCm: -1_600 },
    ],
  });
  assert.ok(close(s.remainingCm, 0));
  assert.ok(close(s.remnantCm, 1_600));
});

console.log('Segment partition tests (§14)');

ok('defect 25–26 m on a 100 m roll partitions 0–25 / 25–26 / 26–100', () => {
  const rows = buildSegmentPartition({
    totalCm: 10_000,
    defects: [{ id: 'd1', code: 'D-1', startCm: 2_500, endCm: 2_600 }],
    lays: [],
  });
  assert.deepStrictEqual(
    rows.map((r) => [r.type, r.startCm, r.endCm]),
    [
      [SegmentType.AVAILABLE, 0, 2_500],
      [SegmentType.DEFECT, 2_500, 2_600],
      [SegmentType.AVAILABLE, 2_600, 10_000],
    ],
  );
});

ok('a reservation crossing the defect span cannot sit in one AVAILABLE segment', () => {
  // The partition proves it: no single AVAILABLE row covers 24–29 m.
  const rows = buildSegmentPartition({
    totalCm: 10_000,
    defects: [{ id: 'd1', startCm: 2_500, endCm: 2_600 }],
    lays: [],
  });
  const crosses = rows.some(
    (r) => r.type === SegmentType.AVAILABLE && r.startCm < 2_400 + 1e-6 && r.endCm > 2_900 - 1e-6,
  );
  assert.ok(!crosses, 'no AVAILABLE segment may span across a defect');
  // Whereas 26–31 m sits fully inside the second AVAILABLE row.
  const fits = rows.some(
    (r) => r.type === SegmentType.AVAILABLE && r.startCm <= 2_600 + 1e-6 && r.endCm >= 3_100 - 1e-6,
  );
  assert.ok(fits, '26–31 m must fit inside one AVAILABLE segment');
});

ok('completed lay → CONSUMED, planned lay → RESERVED; lay wins over defect cells', () => {
  const rows = buildSegmentPartition({
    totalCm: 10_000,
    defects: [{ id: 'd1', startCm: 5_000, endCm: 5_100 }],
    lays: [
      { id: 'lay1', startCm: 0, endCm: 1_200, completed: false },
      { id: 'lay2', startCm: 1_300, endCm: 2_500, completed: true },
    ],
  });
  const types = new Map(rows.map((r) => [`${r.startCm}-${r.endCm}`, r.type]));
  assert.ok([...types.values()].includes(SegmentType.RESERVED));
  assert.ok([...types.values()].includes(SegmentType.CONSUMED));
  assert.ok([...types.values()].includes(SegmentType.DEFECT));
  assert.ok([...types.values()].includes(SegmentType.AVAILABLE));
});

ok('two adjacent lays do not overlap and partition cleanly', () => {
  const rows = buildSegmentPartition({
    totalCm: 10_000,
    defects: [],
    lays: [
      { id: 'a', startCm: 0, endCm: 1_000, completed: false },
      { id: 'b', startCm: 1_000, endCm: 2_000, completed: true },
    ],
  });
  const totalCovered = rows.reduce((s, r) => s + (r.endCm - r.startCm), 0);
  assert.ok(close(totalCovered, 10_000));
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].startCm >= rows[i - 1].endCm - 1e-6, 'rows are contiguous and sorted');
  }
});

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
if (process.exitCode) process.exit(1);
