/**
 * Roll-ledger CONCURRENCY test — proves remaining fabric can never go
 * negative or drift under parallel writers.
 *
 * Attacks, against one API (default http://localhost:3001/api/v1):
 *   A. 6 parallel lay creations on one roll → spans must never overlap
 *   B. 5 parallel cuts on 5 lays of one roll, total demand > remaining
 *      → exactly the affordable cuts succeed; remaining ≥ 0; ledger sum
 *        reconciles with the balance to the last cm
 *   C. 4 parallel cuts on the SAME lay → exactly 1 wins, others rejected
 *   D. single over-consumption cut → rejected
 *
 * Run: node scripts/ledger-concurrency.mjs
 */
const API = process.env.API_URL ?? 'http://localhost:3001/api/v1';

let passed = 0;
let failed = 0;
function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.error(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round4 = (v) => Math.round(v * 10000) / 10000;

async function main() {
  console.log('Roll-ledger concurrency test');
  console.log(`→ ${API}\n`);

  // ── auth ──────────────────────────────────────────────────────────────
  let token = null;
  for (let i = 0; i < 8 && !token; i++) {
    if (i > 0) await sleep(4000); // Neon cold starts
    try {
      token = (await req('POST', '/auth/login', { body: { email: 'owner@acme.test', password: 'Demo@123' } })).json?.data?.accessToken;
    } catch { /* retry */ }
  }
  if (!token) throw new Error('API login failed');
  console.log('logged in\n');

  async function freshRoll(lengthM = 100) {
    const r = await req('POST', '/fabric-rolls', {
      token,
      body: { fabricName: 'Concurrency Drill', fabricType: 'Woven', color: 'Black', length: lengthM, lengthUnit: 'METERS', width: 58, usableWidth: 56.5, widthUnit: 'INCHES' },
    });
    if (!r.json?.data?.id) throw new Error(`roll setup failed: ${JSON.stringify(r.json).slice(0, 200)}`);
    return r.json.data;
  }

  async function finalizedMarker() {
    const r = await req('POST', '/markers', {
      token,
      body: {
        styleRef: 'CONC-DRILL', width: 100, widthUnit: 'CM', endAllowance: 2,
        sizeRatio: { M: 1, L: 1 },
        pieces: [{ name: 'Body', size: 'M', xCm: 0, yCm: 0, widthCm: 98, heightCm: 100 }],
      },
    });
    const m = r.json?.data;
    if (!m?.id) throw new Error(`marker setup failed: ${JSON.stringify(r.json).slice(0, 200)}`);
    const f = await req('POST', `/markers/${m.id}/finalize`, { token, body: {} });
    if (f.status >= 300) throw new Error(`marker finalize failed: ${JSON.stringify(f.json).slice(0, 200)}`);
    return m;
  }

  const getRoll = async (id) => (await req('GET', `/fabric-rolls/${id}`, { token })).json?.data;

  /** Fetch lay plans of a roll with their placement spans. */
  const rollLays = async (rollId) => {
    const r = await req('GET', `/lay-plans?rollId=${rollId}&pageSize=50`, { token });
    const items = Array.isArray(r.json?.data) ? r.json.data : (r.json?.data?.items ?? []);
    return items;
  };

  /**
   * Reconciliation: ledger CONSUMED + WASTE quantities must equal
   * original − remaining exactly, and remaining must never be negative.
   */
  const reconcile = (roll, label) => {
    const txs = roll.transactions ?? [];
    const consumed = round4(txs.filter((t) => t.type === 'CONSUMED' || t.type === 'WASTE').reduce((s, t) => s + Number(t.quantityCm), 0));
    const expected = round4(Number(roll.originalLengthCm) - Number(roll.remainingLengthCm));
    ok(`${label}: ledger sum reconciles with remaining fabric`, Math.abs(consumed + expected) < 1e-6, `ledger ${consumed} vs original−remaining ${expected}`);
    ok(`${label}: remaining ≥ 0`, Number(roll.remainingLengthCm) >= 0, String(roll.remainingLengthCm));
  };

  // ══════════════════════════════════════════════════════════════════════
  // A. Parallel RESERVATIONS on one roll
  // ══════════════════════════════════════════════════════════════════════
  console.log('A. 6 parallel lay creations on one roll');
  {
    const roll = await freshRoll();
    const marker = await finalizedMarker();
    const markerLengthCm = Number(marker.lengthCm);
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        req('POST', '/lay-plans', { token, body: { markerId: marker.id, rollId: roll.id, ply: 1 } }).catch((e) => ({ status: 0, json: { error: { message: String(e.message) } } })),
      ),
    );
    const success = results.filter((r) => r.status < 300);
    console.log(`  (${success.length}/6 reservations accepted)`);
    ok('at least one parallel reservation succeeds', success.length >= 1);

    const lays = await rollLays(roll.id);
    const spans = lays
      .filter((l) => l.status !== 'CANCELLED')
      .map((l) => ({ id: l.id, number: l.number, start: Number(l.markerStartCm), end: Number(l.markerStartCm) + Number(l.markerLengthCm) }))
      .sort((a, b) => a.start - b.start);
    let overlaps = 0;
    const overlapPairs = [];
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        if (spans[j].start < spans[i].end - 1e-6) {
          overlaps++;
          overlapPairs.push(`${spans[i].number}[${spans[i].start}-${spans[i].end}] ∩ ${spans[j].number}[${spans[j].start}-${spans[j].end}]`);
        }
      }
    }
    ok('no two lays reserve overlapping fabric spans', overlaps === 0, overlaps ? overlapPairs.slice(0, 3).join(' | ') : `${spans.length} disjoint spans`);
    const totalReserved = spans.reduce((s, x) => s + (x.end - x.start), 0);
    ok('reserved total ≤ roll length', totalReserved <= Number(roll.originalLengthCm) + 1e-6, `${round4(totalReserved)} cm reserved`);

    // clean up for later scenarios (sequential — cancel is not under test here)
    for (const l of lays.filter((x) => x.status === 'PLANNED')) {
      await req('POST', `/lay-plans/${l.id}/cancel`, { token, body: {} });
    }
    reconcile(await getRoll(roll.id), 'A cleanup');
  }

  // ══════════════════════════════════════════════════════════════════════
  // B. Parallel CUTS on different lays of one roll — demand > remaining
  // ══════════════════════════════════════════════════════════════════════
  console.log('\nB. 5 parallel cuts, total demand 12500 cm on a 10000 cm roll');
  {
    const roll = await freshRoll();
    const marker = await finalizedMarker();
    // 5 lays, disjoint placements (sequential creation so placement is
    // deterministic — the RACE under test is the cut, not the reserve).
    const layIds = [];
    for (let i = 0; i < 5; i++) {
      const r = await req('POST', '/lay-plans', {
        token,
        body: { markerId: marker.id, rollId: roll.id, ply: 1, markerStartCm: i * 500 },
      });
      if (r.status >= 300) throw new Error(`lay ${i} setup failed: ${JSON.stringify(r.json).slice(0, 200)}`);
      layIds.push(r.json.data.id);
    }
    const results = await Promise.all(
      layIds.map((id) =>
        req('POST', `/lay-plans/${id}/complete-cutting`, {
          token,
          body: { actualLengthCm: 2400, actualPieces: 100, wasteLengthCm: 100 },
        }).catch((e) => ({ status: 0, json: { error: { message: String(e.message) } } })),
      ),
    );
    const won = results.filter((r) => r.status < 300);
    const lost = results.filter((r) => r.status >= 300);
    console.log(`  (${won.length} cuts accepted, ${lost.length} rejected)`);

    const after = await getRoll(roll.id);
    ok('exactly 4 cuts fit within the 10000 cm roll (4 × 2500)', won.length === 4, `${won.length} accepted: ${results.map((r) => r.status).join(',')}`);
    ok('rejected cuts cite over-consumption', lost.every((r) => /exceed|remaining/i.test(String(r.json?.error?.message))), lost.map((r) => r.json?.error?.message).join(' | ').slice(0, 160));
    ok('remaining never goes negative', Number(after.remainingLengthCm) >= 0, String(after.remainingLengthCm));
    ok('remaining equals 10000 − 4×2500', Math.abs(Number(after.remainingLengthCm) - 0) < 1e-6 || Math.abs(Number(after.remainingLengthCm) - (10000 - 4 * 2500)) < 1e-6, String(after.remainingLengthCm));
    reconcile(after, 'B');
  }

  // ══════════════════════════════════════════════════════════════════════
  // C. Parallel cuts on the SAME lay — double-cut race
  // ══════════════════════════════════════════════════════════════════════
  console.log('\nC. 4 parallel cuts on the SAME lay');
  {
    const roll = await freshRoll();
    const marker = await finalizedMarker();
    const lay = (await req('POST', '/lay-plans', { token, body: { markerId: marker.id, rollId: roll.id, ply: 1, markerStartCm: 0 } })).json.data;
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        req('POST', `/lay-plans/${lay.id}/complete-cutting`, {
          token,
          body: { actualLengthCm: 500, actualPieces: 50, wasteLengthCm: 0 },
        }).catch((e) => ({ status: 0, json: { error: { message: String(e.message) } } })),
      ),
    );
    const won = results.filter((r) => r.status < 300);
    const lost = results.filter((r) => r.status >= 300);
    console.log(`  (${won.length} accepted, ${lost.length} rejected)`);

    ok('exactly one cut wins the same-lay race', won.length === 1, `${won.length} accepted: ${results.map((r) => r.status).join(',')}`);
    ok('losers cite already-recorded', lost.every((r) => /already/i.test(String(r.json?.error?.message))), lost.map((r) => r.json?.error?.message).join(' | ').slice(0, 160));

    const after = await getRoll(roll.id);
    ok('only one lay-consumption hits the balance (9500 remaining)', Math.abs(Number(after.remainingLengthCm) - 9500) < 1e-6, String(after.remainingLengthCm));
    const consumedRows = (after.transactions ?? []).filter((t) => t.type === 'CONSUMED');
    ok('exactly one CONSUMED ledger row for the lay', consumedRows.length === 1, `${consumedRows.length} CONSUMED rows`);
    reconcile(after, 'C');
  }

  // ══════════════════════════════════════════════════════════════════════
  // D. Single over-consumption is rejected (control)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\nD. over-consumption rejected (control)');
  {
    const roll = await freshRoll(10); // 1000 cm
    const marker = await finalizedMarker();
    const lay = (await req('POST', '/lay-plans', { token, body: { markerId: marker.id, rollId: roll.id, ply: 1, markerStartCm: 0 } })).json.data;
    const r = await req('POST', `/lay-plans/${lay.id}/complete-cutting`, {
      token,
      body: { actualLengthCm: 900, actualPieces: 10, wasteLengthCm: 200 },
    });
    ok('cut exceeding remaining fabric → 400', r.status === 400, String(r.json?.error?.message));
    const after = await getRoll(roll.id);
    ok('roll untouched after rejection', Math.abs(Number(after.remainingLengthCm) - 1000) < 1e-6, String(after.remainingLengthCm));
    reconcile(after, 'D');
  }

  console.log(`\nledger-concurrency: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`✘ ${err.message}`);
  process.exit(1);
});
