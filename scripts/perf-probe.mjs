/**
 * Perf probe — render time, drag-burst latency, pan latency, long tasks.
 * Runs against whatever canvas is currently built (original or optimized).
 * Also diagnoses the click anomaly: dumps selected state + error overlay.
 *
 * Run: node scripts/perf-probe.mjs
 */
import { Cdp, launchBrowser, loginViaForm, makeCanvasApi, drag, sleep, ok, finish } from './cdp-client.mjs';

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:3001/api/v1';

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
for (let i = 0; i < 6 && !token; i++) {
  if (i > 0) await sleep(3000);
  try {
    token = (await req('POST', '/auth/login', { body: { email: 'owner@acme.test', password: 'Demo@123' } })).json?.data?.accessToken;
  } catch { /* retry */ }
}
if (!token) throw new Error('API login failed');

// Reuse the same fixture shape as the stress test.
const N = 210;
const ROWS = 3;
const COLS = Math.ceil((N - 1) / ROWS);
const pieces = [];
for (let i = 0; i < N - 1; i++) {
  const col = Math.floor(i / ROWS);
  const row = i % ROWS;
  pieces.push({ name: `P${String(i + 1).padStart(3, '0')}`, size: ['S', 'M', 'L', 'XL'][i % 4], xCm: col * 11, yCm: row * 38, widthCm: 10.5, heightCm: 37 });
}
pieces.push({ name: 'OUTSIDE', size: 'M', xCm: 0, yCm: 150, widthCm: 10.5, heightCm: 37 });

const marker = (await req('POST', '/markers', {
  token,
  body: { styleRef: 'PERF-PROBE', width: 56.5, widthUnit: 'INCHES', endAllowance: 2, sizeRatio: { S: 1, M: 1, L: 1, XL: 1 }, pieces },
})).json?.data;
console.log(`fixture: ${marker.number}\n`);

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

  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__perf={longTasks:[],total:0};try{new PerformanceObserver((l)=>{for(const e of l.getEntries()){window.__perf.longTasks.push(Math.round(e.duration));window.__perf.total+=e.duration}}).observe({entryTypes:['longtask']})}catch{}`,
  });

  await loginViaForm(cdp, WEB);
  const t0 = Date.now();
  await cdp.send('Page.navigate', { url: `${WEB}/cutting/markers/${marker.id}` });
  // All pieces rendered == the LAST piece's label exists in the SVG (robust
  // against React StrictMode's transient double-mount in dev).
  const deadline = Date.now() + 90000;
  let rendered = -1;
  while (Date.now() < deadline) {
    const n = await cdp.send('Runtime.evaluate', { expression: `(()=>{const s=document.querySelector('svg[aria-label="Marker planning canvas"]');return s&&s.textContent.includes('OUTSIDE · M')?1:0})()`, returnByValue: true });
    if (n?.result?.value) { rendered = Date.now() - t0; break; }
    await sleep(100);
  }
  console.log(`⏱ render (all 210 labels): ${rendered} ms`);
  await sleep(500);

  // click diagnosis on P005 (row 0, col 0 — top-left, always on screen)
  const cal = await api.piecePos('P005', 143.51);
  console.log(`P005 at xCm=${cal.xCm.toFixed(1)} yCm=${cal.yCm.toFixed(1)} ppc=${cal.pxPerCm.toFixed(2)} screen=(${Math.round(cal.x)},${Math.round(cal.y)})`);
  const grab = { x: Math.round(cal.x + 3 * cal.pxPerCm), y: Math.round(cal.y + 3 * cal.pxPerCm) };
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: grab.x, y: grab.y }, 10000);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: grab.x, y: grab.y, button: 'left', clickCount: 1 }, 10000);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: grab.x, y: grab.y, button: 'left', clickCount: 1 }, 10000);
  await sleep(500);
  const diag = await evalJs(`JSON.stringify({
    overlay: !!document.querySelector('nextjs-portal'),
    panelHasP005: [...document.querySelectorAll('input')].some(i => i.value === 'P005'),
    p005Still: [...document.querySelectorAll('svg g')].some(g => { const t = g.querySelector(':scope > text'); return t && t.textContent.startsWith('P005 ·'); }),
    gCount: document.querySelectorAll('svg[aria-label="Marker planning canvas"] g').length,
    url: location.pathname,
  })`);
  console.log(`click diag: ${diag}`);

  // drag burst on P005
  const before = JSON.parse(await evalJs(`JSON.stringify(window.__perf)`));
  const cal2 = await api.piecePos('P005', 143.51);
  const g = { x: Math.round(cal2.x + 3 * cal2.pxPerCm), y: Math.round(cal2.y + 3 * cal2.pxPerCm) };
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x, y: g.y }, 10000);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', clickCount: 1 }, 10000);
  const bStart = Date.now();
  for (let i = 1; i <= 16; i++) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(g.x + (6 * cal2.pxPerCm * i) / 16), y: g.y }, 10000);
    await sleep(16);
  }
  const bMs = Date.now() - bStart;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(g.x + 6 * cal2.pxPerCm), y: g.y, button: 'left', clickCount: 1 }, 10000);
  const after = JSON.parse(await evalJs(`JSON.stringify(window.__perf)`));
  const tasks = after.longTasks.slice(before.longTasks.length);
  console.log(`⏱ burst: ${bMs} ms · long tasks ${tasks.length} · longest ${Math.max(0, ...tasks)} ms · total ${Math.round(tasks.reduce((s, d) => s + d, 0))} ms`);

  // pan from ruler area
  const surf = await api.surfaceRect();
  const pStart = Date.now();
  await drag(cdp, { x: surf.left + surf.width / 2, y: Math.max(2, surf.top - 10) }, { x: surf.left + surf.width / 2 + 200, y: Math.max(2, surf.top - 10) }, { steps: 8, stepDelayMs: 15 });
  console.log(`⏱ pan: ${Date.now() - pStart} ms`);
} finally {
  await cdp?.close();
  await cleanup();
}
console.log('probe done');
