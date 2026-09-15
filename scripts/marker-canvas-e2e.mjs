/**
 * Marker-canvas browser end-to-end test — dependency-free.
 *
 * Drives the REAL editor UI through CDP (Chrome DevTools Protocol) against
 * the running dev servers:
 *
 *   http://localhost:3000  → Next.js web (marker editor)
 *   http://localhost:3001  → NestJS API (fixture setup + server assertions)
 *
 * Uses an installed browser (Chrome, then Edge). No new npm dependencies —
 * Node ≥ 22 speaks WebSocket natively for the CDP transport. Shared CDP
 * plumbing lives in scripts/cdp-client.mjs.
 *
 * The scenario (marker-editor acceptance criteria):
 *   1. login through the form
 *   2. open a DRAFT marker editor
 *   3. drag a pattern piece with real pointer events → geometry moves
 *   4. drag it out of the usable width → live red outline appears
 *   5. Finalize in the UI → rejected by the server (toast + stays DRAFT)
 *   6. drag it back → outline clears, efficiency updates live
 *   7. Save → Finalize → FINALIZED, revision v1 persisted
 *
 * Run: node scripts/marker-canvas-e2e.mjs
 * Env: WEB_URL, API_URL, CHROME_PATH
 */
import { Cdp, loginViaForm, makeCanvasApi, launchBrowser, drag, syntheticDrag, ok, finish, sleep, watchdog } from './cdp-client.mjs';

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:3001/api/v1';

async function main() {
  watchdog(420, () => stage);
  let stage = 'starting';
  console.log('Marker-canvas browser e2e');
  console.log(`→ web ${WEB} · api ${API}\n`);

  // ── fixture setup via API ─────────────────────────────────────────────────
  async function req(method, apiPath, { token, body } = {}) {
    const res = await fetch(`${API}${apiPath}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch { /* empty */ }
    return { status: res.status, json };
  }
  let token = null;
  for (let i = 0; i < 8 && !token; i++) {
    if (i > 0) await sleep(4000); // serverless DB (Neon) can cold-start: be patient
    stage = `API login attempt ${i + 1}`;
    try {
      token = (await req('POST', '/auth/login', { body: { email: 'owner@acme.test', password: 'Demo@123' } })).json?.data?.accessToken;
    } catch { /* retry */ }
  }
  if (!token) throw new Error('API login failed — is the API running on 3001 and its DB reachable?');

  stage = 'creating fixture roll';
  const roll = (await req('POST', '/fabric-rolls', {
    token,
    body: {
      fabricName: 'Cotton Poplin', fabricType: 'Woven', color: 'Navy', shadeLot: 'L-042',
      supplierRef: 'WeaveCraft', gsm: 120, length: 100, lengthUnit: 'METERS',
      width: 58, usableWidth: 56.5, widthUnit: 'INCHES', weightKg: 24.8,
    },
  })).json?.data;
  if (!roll?.id) throw new Error('Setup failed: roll');

  stage = 'creating fixture marker';
  const marker = (await req('POST', '/markers', {
    token,
    body: {
      styleRef: 'SHIRT-001', fabricType: 'Woven', color: 'Navy',
      sizeRatio: { M: 2, L: 2, XL: 1 }, width: 56.5, widthUnit: 'INCHES', endAllowance: 2,
      // Geometry: all inside 143.51 cm width; the Pocket is dragged out of and
      // back into the width during the run.
      pieces: [
        { name: 'Front', size: 'M', xCm: 0, yCm: 0, widthCm: 70, heightCm: 55 },
        { name: 'Back', size: 'M', xCm: 0, yCm: 56, widthCm: 70, heightCm: 55 },
        { name: 'Sleeve', size: 'XL', xCm: 71, yCm: 0, widthCm: 24, heightCm: 58 },
        { name: 'Collar', size: 'XL', xCm: 72, yCm: 60, widthCm: 40, heightCm: 12 },
        { name: 'Pocket', size: 'M', xCm: 5, yCm: 112, widthCm: 14, heightCm: 14 },
      ],
    },
  })).json?.data;
  if (!marker?.id) throw new Error('Setup failed: marker');
  console.log(`fixture: marker ${marker.number} · width 143.51 cm · 5 pieces\n`);

  // ── browser session ───────────────────────────────────────────────────────
  const { port, cleanup } = await launchBrowser();
  let cdp;
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1000, deviceScaleFactor: 1, mobile: false });
    const api = makeCanvasApi(cdp);
    const { evalJs } = api;

    // Surface page errors in the diag output instead of failing silently.
    const pageErrors = [];
    cdp.on((msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        pageErrors.push(String(msg.params?.exceptionDetails?.exception?.description ?? msg.params?.exceptionDetails?.text ?? 'unknown'));
      }
    });

    // Drag a piece to an absolute yCm. Mirrors the real user flow: CLICK the
    // piece to select it, re-measure (selection re-renders), THEN drag. The
    // cold press-and-drag variant is the one sequence that wedges CDP input
    // on this canvas, while click-then-drag is proven stable by the probes.
    const clickPiece = async (grab) => {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: grab.x, y: grab.y }, 10000);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: grab.x, y: grab.y, button: 'left', clickCount: 1 }, 10000);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: grab.x, y: grab.y, button: 'left', clickCount: 1 }, 10000);
      await sleep(350); // selection re-render settles
    };
    const movedSince = async (label, widthCm, ref) => Math.abs((await api.piecePos(label, widthCm)).yCm - ref);
    /**
     * Drag a piece to an absolute yCm. Primary path: REAL PointerEvents
     * dispatched into the DOM (elementFromPoint proves the hit; the events
     * drive the component's actual React handlers, snapping and violation
     * sweep). Fallback: CDP Input domain, which is flaky on this environment
     * (its first dispatch after login can wedge the renderer main thread).
     */
    const dragPieceToY = async (label, widthCm, targetYCm) => {
      for (let attempt = 1; ; attempt++) {
        const cal = await api.piecePos(label, widthCm);
        const grab = { x: Math.round(cal.x + 4 * cal.pxPerCm), y: Math.round(cal.y + 4 * cal.pxPerCm) };
        const dyPx = Math.round((targetYCm - cal.yCm) * cal.pxPerCm);
        // 1. synthetic PointerEvents (component-level truth)
        await syntheticDrag(evalJs, grab, { x: grab.x, y: grab.y + dyPx });
        await sleep(300);
        if (await movedSince(label, widthCm, cal.yCm)) return;
        // 2. CDP OS-level input
        try {
          await clickPiece(grab);
          const cal2 = await api.piecePos(label, widthCm);
          const grab2 = { x: Math.round(cal2.x + 4 * cal2.pxPerCm), y: Math.round(cal2.y + 4 * cal2.pxPerCm) };
          await drag(cdp, grab2, { x: grab2.x, y: grab2.y + Math.round((targetYCm - cal2.yCm) * cal2.pxPerCm) });
          await sleep(300);
          if (await movedSince(label, widthCm, cal.yCm)) return;
          console.log(`  [diag] attempt ${attempt}: piece did not move (synthetic + CDP)`);
        } catch (e) {
          console.log(`  [diag] attempt ${attempt}: CDP input failed — ${e.message}`);
        }
        if (attempt >= 3) throw new Error(`${label}: drag did not move the piece`);
      }
    };

    // 1 ── login through the real form
    await loginViaForm(cdp, WEB);
    ok('login through the form lands on /dashboard', true);

    // 2 ── open the fixture marker editor
    await cdp.send('Page.navigate', { url: `${WEB}/cutting/markers/${marker.id}` });
    await api.waitForCanvas(`Pocket · M`);

    const pieces0 = await api.piecesShown();
    ok('editor shows the 5 fixture pieces', pieces0 === '5', JSON.stringify(pieces0));
    const eff0 = await api.effShown();
    ok('live efficiency renders', eff0 !== null && Number(eff0) > 0, String(eff0));

    // Calibration: px-per-cm from the surface HEIGHT — the surface's vertical
    // extent IS the usable width (143.51 cm), regardless of marker length.
    const cal0 = await api.piecePos('Pocket', 143.51);
    const pxPerCm = cal0.pxPerCm;
    ok('px/cm calibrated from the fabric surface', pxPerCm > 0.5 && pxPerCm < 12, pxPerCm.toFixed(2));

    // ── 3. DRAG the Pocket piece down (real CDP pointer sequence)
    console.log(`  [diag] hit at grab point: ${await api.hitTest(cal0.x + 4 * pxPerCm, cal0.y + 4 * pxPerCm)}`);
    console.log(`  [diag] pre-drag sanity evaluate: ${await evalJs('1+1')}`);
    await dragPieceToY('Pocket', 143.51, cal0.yCm + 3); // +3 cm pointer motion, snaps to a 5 cm grid step
    await sleep(250);

    const cal1 = await api.piecePos('Pocket', 143.51);
    const movedCm = cal1.yCm - cal0.yCm;
    if (movedCm <= 2) console.log(`  [diag] after failed drag: ${await api.hitTest(cal0.x + 4 * pxPerCm, cal0.y + 4 * pxPerCm)} · pageErrors: ${pageErrors.length ? pageErrors.slice(-3).join(' | ') : 'none'}`);
    ok('drag moves the piece (~+5 cm net after snapping)', movedCm > 2 && movedCm < 8, `moved ${movedCm.toFixed(2)} cm`);

    // ── 4. VIOLATE the usable width: push it past the bottom selvedge
    // Pocket sits ~117 after the drag, 14 cm tall → bottom 131 < 143.51.
    // Drive yCm to 135: bottom = 149 > 143.51 → OUTSIDE_WIDTH.
    // Drive yCm to 135: bottom = 149 > 143.51 → OUTSIDE_WIDTH.
    await dragPieceToY('Pocket', 143.51, 135);
    await sleep(250);

    const reds = await api.redOutlines();
    ok('piece outside usable width shows the live red outline', reds >= 1, `${reds} red outlines`);

    const eff1 = await api.effShown();
    ok('efficiency updates live while pieces move', Number(eff1) < Number(eff0), `${eff0}% → ${eff1}%`);

    // ── 5. Finalize in the UI → the server must reject it
    await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Finalize'))?.click()`);
    const toast = String((await evalJs(`document.querySelector('[data-sonner-toast]')?.textContent ?? ''`)) ?? '');
    ok('finalize rejected while a piece is outside the width', /cannot be finalized|width/i.test(toast), `toast: "${toast.slice(0, 160)}"`);

    const stillDraft = await evalJs(`document.body.textContent.includes('DRAFT') && !document.body.textContent.includes('Finalized — locked for editing')`);
    ok('marker stays DRAFT after rejected finalize', !!stillDraft);

    // ── 6. FIX it: drag back inside the usable width. yCm 120 keeps the
    // pocket clear of every other piece (Back ends at 111) and inside the
    // width: 120 + 14 = 134 < 143.51.
    await dragPieceToY('Pocket', 143.51, 120);
    await sleep(250);
    const reds2 = await api.redOutlines();
    ok('drag back inside → red outline clears', reds2 === 0, `${reds2} red outlines remain`);

    // ── 7. SAVE + FINALIZE through the UI
    await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save' && !b.disabled)?.click()`);
    await api.waitForToast('saved');
    await evalJs(`document.querySelector('[data-sonner-toast] [data-button]')?.click(); 'ok'`);
    await sleep(400);
    await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Finalize') && !b.disabled)?.click()`);
    await api.waitForFinalized();
    ok('finalize through the UI succeeds after fixing', true);

    const serverMarker = (await req('GET', `/markers/${marker.id}`, { token })).json?.data;
    ok('server persisted the FINALIZED status', serverMarker?.status === 'FINALIZED', String(serverMarker?.status));
    ok('server persisted a v1 revision from the UI finalize', (serverMarker?.revisions?.length ?? 0) >= 1, JSON.stringify(serverMarker?.revisions?.map((r) => r.revisionNumber)));
    const pocketSaved = serverMarker?.pieces?.find((p) => p.name === 'Pocket');
    ok('dragged geometry persisted (Pocket yCm snapped to grid)', Math.abs(Number(pocketSaved?.yCm) - 120) < 6, `yCm=${pocketSaved?.yCm}`);
  } finally {
    await cdp?.close();
    await cleanup();
  }

  finish('marker-canvas e2e');
}

main().catch((err) => {
  console.error(`✘ ${err.message}`);
  process.exit(1);
});
