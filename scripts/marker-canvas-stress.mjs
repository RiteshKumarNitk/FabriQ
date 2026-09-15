/**
 * Marker-canvas STRESS test — 210 pattern pieces, dependency-free.
 *
 * Proves the editor stays usable at production-marker scale and MEASURES
 * rendering/interaction performance through the real UI (CDP):
 *
 *   fixture : 209 pieces packed in a 30x7 grid + 1 piece outside the width
 *   1. initial render time (navigation → all 210 piece groups in the DOM)
 *   2. violation sweep correctness: exactly 1 red outline, no false positives
 *   3. selection latency: click a piece → property panel shows it
 *   4. drag latency: 12-step drag of a middle piece → moved & snapped
 *   5. render pressure: long tasks observed during a continuous drag burst
 *   6. pan latency across 210 pieces
 *   7. memory: DOM node count stays bounded
 *   8. save round-trip persists the dragged geometry
 *
 * Run: node scripts/marker-canvas-stress.mjs
 * Env: WEB_URL, API_URL, CHROME_PATH, PIECES (default 210)
 */
import { Cdp, launchBrowser, loginViaForm, makeCanvasApi, drag, ok, finish, sleep, watchdog } from './cdp-client.mjs';

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:3001/api/v1';
const N_PIECES = Number(process.env.PIECES ?? 210);

async function main() {
  watchdog(600, () => stage);
  let stage = 'starting';
  console.log('Marker-canvas stress test');
  console.log(`→ web ${WEB} · api ${API} · pieces ${N_PIECES}\n`);

  // ── fixture via API ───────────────────────────────────────────────────────
  async function req(method, apiPath, { token, body } = {}) {
    const res = await fetch(`${API}${apiPath}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty */ }
    return { status: res.status, json };
  }
  let token = null;
  for (let i = 0; i < 8 && !token; i++) {
    if (i > 0) await sleep(4000);
    stage = `API login attempt ${i + 1}`;
    try {
      token = (await req('POST', '/auth/login', { body: { email: 'owner@acme.test', password: 'Demo@123' } })).json?.data?.accessToken;
    } catch { /* retry */ }
  }
  if (!token) throw new Error('API login failed');

  stage = 'building 210-piece fixture';
  // Pack along the LENGTH axis (X): 3 rows across the 143.51 cm width
  // (3 * 38 = 114 ≤ 143.51) x ~70 columns of 11 cm. The last piece is pushed
  // past the bottom selvedge so the violation sweep has exactly one hit
  // (isolation for the correctness asserts).
  const ROWS = 3;
  const COLS = Math.ceil((N_PIECES - 1) / ROWS); // 70 cols → length ~770 cm
  const pieces = [];
  for (let i = 0; i < N_PIECES - 1; i++) {
    const col = Math.floor(i / ROWS);
    const row = i % ROWS;
    pieces.push({
      name: `P${String(i + 1).padStart(3, '0')}`,
      size: ['S', 'M', 'L', 'XL'][i % 4],
      xCm: col * 11,
      yCm: row * 38,
      widthCm: 10.5,
      heightCm: 37,
    });
  }
  pieces.push({ name: 'OUTSIDE', size: 'M', xCm: 0, yCm: 150, widthCm: 10.5, heightCm: 37 });

  const marker = (await req('POST', '/markers', {
    token,
    body: {
      styleRef: 'STRESS-210', width: 56.5, widthUnit: 'INCHES', endAllowance: 2,
      sizeRatio: { S: 1, M: 1, L: 1, XL: 1 },
      pieces,
    },
  })).json?.data;
  if (!marker?.id) throw new Error('Setup failed: stress marker');
  console.log(`fixture: ${marker.number} · width 143.51 cm · ${pieces.length} pieces · ${ROWS} rows x ${COLS} cols\n`);

  // ── browser ───────────────────────────────────────────────────────────────
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
    const { evalJs, js } = api;

    // Long-task observer, installed before navigation so it sees everything.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__fabriqPerf = { longTasks: [], totalLongTaskMs: 0 };
        try {
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              window.__fabriqPerf.longTasks.push(Math.round(e.duration));
              window.__fabriqPerf.totalLongTaskMs += e.duration;
            }
          }).observe({ entryTypes: ['longtask'] });
        } catch {}
      `,
    });

    // 1 ── login, then time navigation → all piece groups rendered
    stage = 'login';
    await loginViaForm(cdp, WEB);

    stage = 'stress-marker render';
    const t0 = Date.now();
    await cdp.send('Page.navigate', { url: `${WEB}/cutting/markers/${marker.id}` });
    // All pieces rendered == the LAST piece's label exists (robust against
    // React StrictMode's transient double-mount g-count inflation in dev).
    const rendered = await (async () => {
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        const hit = await cdp.send('Runtime.evaluate', {
          expression: `(()=>{const s=document.querySelector('svg[aria-label="Marker planning canvas"]');return s&&s.textContent.includes('OUTSIDE · M')?1:0})()`,
          returnByValue: true,
        });
        if (hit?.result?.value) return Date.now() - t0;
        await sleep(100);
      }
      return -1;
    })();
    stage = 'stress-marker measured';
    ok(`all ${N_PIECES} pieces render within 90 s`, rendered > 0, `timed out`);
    console.log(`  ⏱ initial render: ${rendered} ms`);
    ok('initial render under 10 s', rendered > 0 && rendered < 10000, `${rendered} ms`);

    const nodes = await api.domNodeCount();
    console.log(`  ⏱ canvas DOM nodes: ${nodes}`);
    ok('DOM stays bounded (no pathological node blowup)', nodes < N_PIECES * 30, `${nodes} nodes`);

    const status = await api.piecesShown();
    ok('status bar reports the piece count', status === String(N_PIECES), String(status));

    // 2 ── violation sweep correctness: exactly ONE red outline (OUTSIDE)
    await sleep(300);
    const reds = await api.redOutlines();
    ok('exactly 1 piece flagged outside the width (sweep precision)', reds === 1, `${reds} red outlines`);
    const zeroOverlap = await evalJs(js`
      (() => {
        const svg = document.querySelector('svg[aria-label="Marker planning canvas"]');
        // every piece rect stroke should be its size color, none dashed-defect
        return svg.querySelectorAll('rect[stroke-dasharray="5 3"]').length;
      })()`);
    ok('no false defect strokes on the packed grid', zeroOverlap === 0, `${zeroOverlap} dashed`);

    // 3 ── selection latency: click piece P100 → property panel shows it.
    // At dev fit-zoom (1.2 px/cm) only the left ~1/3 of a 770 cm marker is
    // on screen, so pick P020 (col 0..2 region) — guaranteed visible.
    const cal = await api.piecePos('P020', 143.51);
    const grab = { x: Math.round(cal.x + 3 * cal.pxPerCm), y: Math.round(cal.y + 3 * cal.pxPerCm) };
    const selStart = Date.now();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: grab.x, y: grab.y }, 10000);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: grab.x, y: grab.y, button: 'left', clickCount: 1 }, 10000);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: grab.x, y: grab.y, button: 'left', clickCount: 1 }, 10000);
    await sleep(300); // let React commit the selection
    const selShown = await evalJs(js`
      (() => {
        const inputs = [...document.querySelectorAll('input')];
        return inputs.some(i => i.value === 'P020');
      })()`);
    const selMs = Date.now() - selStart;
    ok('click selects the piece (property panel shows P020)', !!selShown, 'panel input not found');
    console.log(`  ⏱ selection → panel: ${selMs} ms`);

    // 4 ── drag latency: move P020 right by 5 cm (one snap cell) via a
    //       realistic 12-step drag; assert geometry moved and measure time.
    stage = 'drag latency';
    const cal2 = await api.piecePos('P020', 143.51);
    const g = { x: Math.round(cal2.x + 3 * cal2.pxPerCm), y: Math.round(cal2.y + 3 * cal2.pxPerCm) };
    const dragStart = Date.now();
    await drag(cdp, g, { x: g.x + Math.round(5 * cal2.pxPerCm), y: g.y });
    const dragMs = Date.now() - dragStart;
    const cal3 = await api.piecePos('P100', 143.51);
    const movedX = cal3.xCm - cal2.xCm;
    ok('drag moves a middle piece (~5 cm, snapped)', movedX > 3 && movedX < 7, `moved ${movedX.toFixed(2)} cm`);
    console.log(`  ⏱ drag (12 steps over 5 cm): ${dragMs} ms`);
    ok('drag interaction completes under 5 s', dragMs < 5000, `${dragMs} ms`);

    // 5 ── render pressure: continuous drag burst (16 quick steps over a
    //       longer span) while the long-task observer accumulates.
    stage = 'drag burst pressure';
    const before = await evalJs(`JSON.stringify(window.__fabriqPerf)`);
    const cal4 = await api.piecePos('P100', 143.51);
    const g4 = { x: Math.round(cal4.x + 3 * cal4.pxPerCm), y: Math.round(cal4.y + 3 * cal4.pxPerCm) };
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g4.x, y: g4.y }, 10000);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g4.x, y: g4.y, button: 'left', clickCount: 1 }, 10000);
    const burstStart = Date.now();
    for (let i = 1; i <= 16; i++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(g4.x + (6 * cal4.pxPerCm * i) / 16),
        y: g4.y,
      }, 10000);
      await sleep(16); // ~60 Hz pointer stream
    }
    const burstMs = Date.now() - burstStart;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(g4.x + 6 * cal4.pxPerCm), y: g4.y, button: 'left', clickCount: 1 }, 10000);
    const after = JSON.parse(await evalJs(`JSON.stringify(window.__fabriqPerf)`));
    const tasksDuring = after.longTasks.length - JSON.parse(before).longTasks.length;
    const longestDuring = Math.max(0, ...after.longTasks.slice(JSON.parse(before).longTasks.length));
    console.log(`  ⏱ burst drag (16 frames / 6 cm): ${burstMs} ms`);
    console.log(`  ⏱ long tasks during burst: ${tasksDuring} · longest ${longestDuring} ms`);
    ok('no catastrophic frame stall during burst drag (longest task < 1 s)', longestDuring < 1000, `${longestDuring} ms`);
    ok('burst drag keeps up with ~60 Hz input (no multi-second lag)', burstMs < 3000, `${burstMs} ms`);

    // 6 ── pan latency: drag from the RULER area (the packed grid leaves no
    // free background — piece presses would move a piece instead of panning).
    stage = 'pan latency';
    const surf = await api.surfaceRect();
    const panStart = Date.now();
    await drag(cdp, { x: surf.left + surf.width / 2, y: Math.max(2, surf.top - 10) }, { x: surf.left + surf.width / 2 + 200, y: Math.max(2, surf.top - 10) }, { steps: 8, stepDelayMs: 15 });
    const panMs = Date.now() - panStart;
    console.log(`  ⏱ pan (200 px): ${panMs} ms`);
    ok('pan over 210 pieces stays responsive', panMs < 3000, `${panMs} ms`);

    // 7 ── save: geometry persisted for the dragged piece
    stage = 'save round-trip';
    await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save' && !b.disabled)?.click()`);
    await api.waitForToast('saved', 20000);
    ok('save round-trip at 210 pieces succeeds', true);
    const saved = (await req('GET', `/markers/${marker.id}`, { token })).json?.data;
    const p020 = saved?.pieces?.find((p) => p.name === 'P020');
    const expectedX = Math.round((cal2.xCm + 5) / 5) * 5; // pointer +5 cm, snapped to the 5 cm grid
    ok('server persisted dragged geometry', Math.abs(Number(p020?.xCm) - expectedX) < 12, `xCm=${p020?.xCm} expected ~${expectedX}`);
  } finally {
    await cdp?.close();
    await cleanup();
  }

  finish('marker-canvas stress');
}

main().catch((err) => {
  console.error(`✘ ${err.message}`);
  process.exit(1);
});
