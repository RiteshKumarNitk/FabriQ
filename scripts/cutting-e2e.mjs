/**
 * End-to-end smoke test for the Cutting Room — runs the exact §40 scenario
 * against a running API (default http://localhost:3001):
 *
 *   100 m × 58" roll → usable 56.5" → measurement → defect 27–29 m →
 *   marker (M2/L2/XL1 = 5 garments) → finalize (revision snapshot) →
 *   lay 40 ply (200 theoretical) → cut → ledger → remaining fabric.
 *
 * Tenant isolation is proven twice: the owner token can read everything,
 * while a cross-tenant user gets 403/404 and an unauthenticated request 401.
 *
 * Run: node scripts/cutting-e2e.mjs
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
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

async function login(email, password) {
  const { json } = await req('POST', '/auth/login', { body: { email, password } });
  if (!json?.data?.accessToken) throw new Error(`Login failed for ${email}`);
  return json.data.accessToken;
}

async function main() {
  console.log('Cutting Room end-to-end smoke test');
  console.log(`→ ${API}\n`);

  // ── auth ────────────────────────────────────────────────────────────────
  const owner = await login('owner@acme.test', 'Demo@123');
  const manager = await login('manager@acme.test', 'Demo@123');
  const other = await login('admin@fabriq.local', 'Admin@123'); // platform admin = outside tenant data path
  ok('login: tenant owner + manager + platform admin', !!owner && !!manager && !!other);

  // ── 1. create the 100 m × 58" roll ─────────────────────────────────────
  let r = await req('POST', '/fabric-rolls', {
    token: owner,
    body: {
      fabricName: 'Cotton Poplin',
      fabricType: 'Woven',
      color: 'Navy',
      shadeLot: 'L-042',
      supplierRef: 'WeaveCraft',
      gsm: 120,
      length: 100,
      lengthUnit: 'METERS',
      width: 58,
      usableWidth: 56.5,
      widthUnit: 'INCHES',
      weightKg: 24.8,
    },
  });
  ok('roll created (100 m × 58", usable 56.5")', r.status === 201 || r.status === 200, `status ${r.status}: ${JSON.stringify(r.json?.error ?? r.json).slice(0, 200)}`);
  const roll = r.json?.data;
  ok('roll number assigned (R-…)', /^R-\d{4}-\d{4}$/.test(roll?.number ?? ''), roll?.number);
  ok('length normalized to base cm (10000)', Number(roll?.originalLengthCm) === 10000, String(roll?.originalLengthCm));
  ok('width normalized to base cm (147.32)', Math.abs(Number(roll?.widthCm) - 147.32) < 1e-6, String(roll?.widthCm));
  ok('usable width < nominal width (143.51)', Math.abs(Number(roll?.usableWidthCm) - 143.51) < 1e-6, String(roll?.usableWidthCm));
  ok('roll starts with one AVAILABLE segment', roll?.segments?.length === 1 && roll.segments[0].type === 'AVAILABLE');

  // Validation: usable > nominal is rejected
  r = await req('POST', '/fabric-rolls', {
    token: owner,
    body: { length: 10, lengthUnit: 'METERS', width: 40, usableWidth: 50, widthUnit: 'INCHES' },
  });
  ok('usable width > nominal width → rejected', r.status === 400, String(r.json?.error?.message));

  // ── 2. record a measurement (multi-point width) ────────────────────────
  r = await req('POST', `/fabric-rolls/${roll.id}/measurements`, {
    token: manager,
    body: { length: 100, beginWidth: 57, middleWidth: 58, endWidth: 57.5, usableWidth: 56.5, note: 'opening measure' },
  });
  ok('measurement recorded (begin/middle/end)', r.status === 200 || r.status === 201, String(r.json?.error?.message));
  r = await req('GET', `/fabric-rolls/${roll.id}`, { token: manager });
  ok('measurement stores min/max/avg widths', r.json?.data?.minWidthCm != null && r.json?.data?.maxWidthCm != null);

  // ── 3. map the defect at 27–29 m ────────────────────────────────────────
  r = await req('POST', `/fabric-rolls/${roll.id}/defects`, {
    token: manager,
    body: { defectType: 'STAIN', startCm: 2700, endCm: 2900, affectedWidthCm: 25.4, severity: 'MAJOR', notes: 'Oil stain' },
  });
  ok('defect D-1 mapped at 27–29 m', (r.status === 200 || r.status === 201) && r.json?.data?.code === 'D-1', String(r.json?.error?.message));
  r = await req('GET', `/fabric-rolls/${roll.id}`, { token: manager });
  const segTypes = r.json?.data?.segments?.map((s) => s.type) ?? [];
  ok('segment engine carved a DEFECT span', segTypes.includes('DEFECT'), segTypes.join(','));

  // ── 4. build the marker (M2 L2 XL1) ─────────────────────────────────────
  r = await req('POST', '/markers', {
    token: owner,
    body: {
      styleRef: 'SHIRT-001',
      fabricType: 'Woven',
      color: 'Navy',
      sizeRatio: { M: 2, L: 2, XL: 1 },
      width: 56.5,
      widthUnit: 'INCHES',
      endAllowance: 2,
      // x runs along the marker length, y spans the usable width (143.51 cm).
      pieces: [
        { name: 'Front', size: 'M', xCm: 0, yCm: 0, widthCm: 70, heightCm: 55 },
        { name: 'Front', size: 'L', xCm: 71, yCm: 0, widthCm: 72, heightCm: 57 },
        { name: 'Back', size: 'M', xCm: 0, yCm: 56, widthCm: 70, heightCm: 55 },
        { name: 'Back', size: 'L', xCm: 71, yCm: 58, widthCm: 72, heightCm: 57 },
        { name: 'Sleeve', size: 'XL', xCm: 144, yCm: 0, widthCm: 24, heightCm: 58 },
        { name: 'Sleeve', size: 'XL', xCm: 169, yCm: 0, widthCm: 24, heightCm: 58 },
        { name: 'Sleeve', size: 'XL', xCm: 194, yCm: 0, widthCm: 24, heightCm: 58 },
        { name: 'Collar', size: 'XL', xCm: 0, yCm: 116, widthCm: 40, heightCm: 12 },
        { name: 'Collar', size: 'M', xCm: 41, yCm: 116, widthCm: 40, heightCm: 12 },
        { name: 'Collar', size: 'L', xCm: 82, yCm: 116, widthCm: 40, heightCm: 12 },
        { name: 'Pocket', size: 'M', xCm: 0, yCm: 129, widthCm: 14, heightCm: 14 },
        { name: 'Pocket', size: 'L', xCm: 15, yCm: 129, widthCm: 14, heightCm: 14 },
        { name: 'Pocket', size: 'XL', xCm: 30, yCm: 129, widthCm: 14, heightCm: 14 },
      ],
    },
  });
  ok('marker created with 13 pattern pieces', r.status === 200 || r.status === 201, `status ${r.status}: ${JSON.stringify(r.json?.error ?? r.json).slice(0, 300)}`);
  const marker = r.json?.data;
  ok('garments per marker = 5 (M2 L2 XL1)', marker?.garmentsPerMarker === 5, String(marker?.garmentsPerMarker));
  ok('marker length derived from farthest piece + allowance', Number(marker?.lengthCm) === 220, String(marker?.lengthCm));
  ok('server-computed planning efficiency 0 < e ≤ 100', Number(marker?.efficiencyPct) > 0 && Number(marker?.efficiencyPct) <= 100, String(marker?.efficiencyPct));

  // Overlap → finalize must be blocked
  r = await req('PATCH', `/markers/${marker.id}`, {
    token: owner,
    body: {
      pieces: [
        { name: 'Front', size: 'M', xCm: 0, yCm: 0, widthCm: 70, heightCm: 55 },
        { name: 'Back', size: 'M', xCm: 20, yCm: 20, widthCm: 70, heightCm: 55 },
      ],
    },
  });
  ok('overlap saved as draft (planner may explore)', r.status === 200, String(r.json?.error?.message));
  r = await req('POST', `/markers/${marker.id}/finalize`, { token: owner, body: {} });
  ok('finalize with overlapping pieces → blocked', r.status === 400 && /overlap/i.test(r.json?.error?.message ?? ''), String(r.json?.error?.message));

  // Out-of-width → finalize blocked
  r = await req('PATCH', `/markers/${marker.id}`, {
    token: owner,
    body: {
      pieces: [
        { name: 'Front', size: 'M', xCm: 0, yCm: 0, widthCm: 70, heightCm: 55 },
        { name: 'Tall', size: 'M', xCm: 0, yCm: 120, widthCm: 40, heightCm: 60 },
      ],
    },
  });
  r = await req('POST', `/markers/${marker.id}/finalize`, { token: owner, body: {} });
  ok('finalize with piece outside usable width → blocked', r.status === 400 && /width/i.test(r.json?.error?.message ?? ''), String(r.json?.error?.message));

  // Restore the valid layout and finalize.
  r = await req('PATCH', `/markers/${marker.id}`, {
    token: owner,
    body: {
      pieces: [
        { name: 'Front', size: 'M', xCm: 0, yCm: 0, widthCm: 70, heightCm: 55 },
        { name: 'Front', size: 'L', xCm: 71, yCm: 0, widthCm: 72, heightCm: 57 },
        { name: 'Back', size: 'M', xCm: 0, yCm: 56, widthCm: 70, heightCm: 55 },
        { name: 'Back', size: 'L', xCm: 71, yCm: 58, widthCm: 72, heightCm: 57 },
        { name: 'Sleeve', size: 'XL', xCm: 144, yCm: 0, widthCm: 24, heightCm: 58 },
        { name: 'Sleeve', size: 'XL', xCm: 169, yCm: 0, widthCm: 24, heightCm: 58 },
        { name: 'Sleeve', size: 'XL', xCm: 194, yCm: 0, widthCm: 24, heightCm: 58 },
        { name: 'Collar', size: 'XL', xCm: 0, yCm: 116, widthCm: 40, heightCm: 12 },
        { name: 'Collar', size: 'M', xCm: 41, yCm: 116, widthCm: 40, heightCm: 12 },
        { name: 'Collar', size: 'L', xCm: 82, yCm: 116, widthCm: 40, heightCm: 12 },
        { name: 'Pocket', size: 'M', xCm: 0, yCm: 129, widthCm: 14, heightCm: 14 },
        { name: 'Pocket', size: 'L', xCm: 15, yCm: 129, widthCm: 14, heightCm: 14 },
        { name: 'Pocket', size: 'XL', xCm: 30, yCm: 129, widthCm: 14, heightCm: 14 },
      ],
    },
  });
  ok('valid layout restored', r.status === 200, String(r.json?.error?.message));
  r = await req('POST', `/markers/${marker.id}/finalize`, { token: owner, body: { note: 'planner sign-off' } });
  ok('finalize succeeds on the valid layout', r.status === 200 || r.status === 201, String(r.json?.error?.message));
  r = await req('GET', `/markers/${marker.id}`, { token: owner });
  ok('finalize wrote revision v1', (r.json?.data?.revisions?.length ?? 0) >= 1, JSON.stringify(r.json?.data?.revisions?.map((x) => x.revisionNumber)));

  // Duplicate marker for the what-if B option.
  r = await req('POST', `/markers/${marker.id}/duplicate`, { token: owner });
  const markerB = r.json?.data;
  ok('marker duplicated as a new draft', (r.status === 200 || r.status === 201) && markerB?.status === 'DRAFT', String(r.json?.error?.message));

  // ── 5. cut order + lay planning ────────────────────────────────────────
  r = await req('POST', '/cut-orders', {
    token: owner,
    body: { styleRef: 'SHIRT-001', color: 'Navy', required: { M: 200, L: 300, XL: 200 }, notes: 'e2e order' },
  });
  const order = r.json?.data;
  ok('cut order created (M200 L300 XL200)', r.status === 200 || r.status === 201, String(r.json?.error?.message));
  ok('cut order number assigned (CO-…)', /^CO-\d{4}-\d{4}$/.test(order?.number ?? ''), order?.number);

  r = await req('POST', '/lay-plans', {
    token: owner,
    body: { cutOrderId: order.id, markerId: marker.id, rollId: roll.id, ply: 0 },
  });
  ok('ply = 0 rejected', r.status === 400, String(r.json?.error?.message));

  r = await req('POST', '/lay-plans', {
    token: owner,
    body: { cutOrderId: order.id, markerId: marker.id, rollId: roll.id, ply: 40 },
  });
  ok('lay planned: marker 4.8-ish m × 40 ply', r.status === 200 || r.status === 201, String(r.json?.error?.message));
  const lay = r.json?.data;
  ok('theoretical output = 5 × 40 = 200', lay?.theoreticalPieces === 200, String(lay?.theoreticalPieces));
  ok('fabric planned = marker length (single ply — ply never multiplies fabric)', Math.abs(Number(lay?.fabricPlannedCm) - Number(marker.lengthCm)) < 1e-6);
  r = await req('GET', `/fabric-rolls/${roll.id}`, { token: owner });
  ok('roll shows a RESERVED span for the lay', (r.json?.data?.segments ?? []).some((s) => s.type === 'RESERVED'));
  ok('remaining fabric unchanged by reservation', Number(r.json?.data?.remainingLengthCm) === 10000);

  // Lay across the defect must be rejected.
  r = await req('POST', '/lay-plans', {
    token: owner,
    body: { cutOrderId: order.id, markerId: marker.id, rollId: roll.id, ply: 10, markerStartCm: 2800, allowDefectOverlap: true },
  });
  ok('lay across the defect span → rejected', r.status === 400, String(r.json?.error?.message));

  // ── 6. record actual cutting ───────────────────────────────────────────
  r = await req('POST', `/lay-plans/${lay.id}/complete-cutting`, {
    token: manager,
    body: { actualLengthCm: 226, actualPieces: 200, wasteLengthCm: 4, rejectedPieces: 3, notes: 'e2e cut' },
  });
  ok('cutting recorded (actual ≠ planned)', r.status === 200 || r.status === 201, String(r.json?.error?.message));

  r = await req('GET', `/fabric-rolls/${roll.id}`, { token: owner });
  const rollAfter = r.json?.data;
  const ledger = rollAfter?.transactions ?? [];
  ok('ledger: MEASURED → RESERVED → CONSUMED → WASTE in order', (() => {
    const types = ledger.map((t) => t.type);
    const i = types.indexOf('MEASURED');
    const j = types.indexOf('RESERVED');
    const k = types.indexOf('CONSUMED');
    const w = types.indexOf('WASTE');
    return i !== -1 && j > i && k > j && w > k;
  })());
  const consumed = ledger.filter((t) => t.type === 'CONSUMED').reduce((s, t) => s + Math.abs(Number(t.quantityCm)), 0);
  ok('consumed = actual length (226 cm)', Math.abs(consumed - 226) < 1e-6, String(consumed));
  ok('remaining = 10000 − 226 − 4 (waste)', Math.abs(Number(rollAfter.remainingLengthCm) - 9770) < 1e-6, String(rollAfter.remainingLengthCm));
  ok('roll shows a CONSUMED span on the timeline', (rollAfter.segments ?? []).some((s) => s.type === 'CONSUMED'));

  // Double-cut is locked.
  r = await req('POST', `/lay-plans/${lay.id}/complete-cutting`, {
    token: manager,
    body: { actualLengthCm: 10, actualPieces: 5 },
  });
  ok('completed lay cannot be cut twice', r.status === 400);

  // Over-consumption guard.
  r = await req('GET', '/cut-orders', { token: owner });
  ok('cut order visible in list', (Array.isArray(r.json?.data) ? r.json.data : r.json?.data?.items ?? []).some((o) => o.id === order.id));

  // ── 7. tenant isolation ────────────────────────────────────────────────
  r = await req('GET', `/fabric-rolls/${roll.id}`, {});
  ok('unauthenticated roll read → 401', r.status === 401, String(r.status));
  r = await req('GET', `/fabric-rolls/${roll.id}`, { token: other });
  ok('cross-tenant roll read → 403/404', r.status === 403 || r.status === 404, String(r.status));
  r = await req('PATCH', `/markers/${marker.id}`, { token: other, body: { notes: 'hacked' } });
  ok('cross-tenant marker mutation → 403/404', r.status === 403 || r.status === 404, String(r.status));
  r = await req('GET', `/lay-plans/${lay.id}`, { token: other });
  ok('cross-tenant lay read → 403/404', r.status === 403 || r.status === 404, String(r.status));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
