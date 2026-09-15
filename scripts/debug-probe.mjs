/**
 * Debug probe for the two stress anomalies:
 *  A. OUTSIDE piece renders no red violation rect on the optimized build
 *  B. 12-step drag reports a 297 cm jump for P020
 *
 * Dumps DOM state (violation rects, OUTSIDE markup, toolbar px/cm, piece
 * translates) before/after each interaction.
 *
 * Run: node scripts/debug-probe.mjs
 */
import { Cdp, launchBrowser, loginViaForm, makeCanvasApi, drag, sleep } from './cdp-client.mjs';

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
  body: { styleRef: 'DEBUG-PROBE', width: 56.5, widthUnit: 'INCHES', endAllowance: 2, sizeRatio: { S: 1, M: 1, L: 1, XL: 1 }, pieces },
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

  await loginViaForm(cdp, WEB);
  await cdp.send('Page.navigate', { url: `${WEB}/cutting/markers/${marker.id}` });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const hit = await cdp.send('Runtime.evaluate', { expression: `(()=>{const s=document.querySelector('svg[aria-label="Marker planning canvas"]');return s&&s.textContent.includes('OUTSIDE · M')?1:0})()`, returnByValue: true });
    if (hit?.result?.value) break;
    await sleep(100);
  }
  await sleep(500);

  const dump = async (label) => {
    const d = await evalJs(`(() => {
      const svg = document.querySelector('svg[aria-label="Marker planning canvas"]');
      if (!svg) return JSON.stringify({ err: 'no svg' });
      const redsAny = svg.querySelectorAll('rect[stroke="hsl(0 72% 51%)"]').length;
      const redsNone = svg.querySelectorAll('rect[stroke="hsl(0 72% 51%)"][fill="none"]').length;
      const dashed = svg.querySelectorAll('rect[stroke-dasharray="5 3"]').length;
      const g = [...svg.querySelectorAll('g')].find(el => { const t = el.querySelector(':scope > text'); return t && t.textContent.startsWith('OUTSIDE ·'); });
      const ppcEl = [...document.querySelectorAll('div')].find(d => typeof d.className === 'string' && d.className.includes('px/cm'));
      return JSON.stringify({
        redsAny, redsNone, dashed,
        outsideHasInvalidRect: g ? !!g.querySelector('rect[stroke="hsl(0 72% 51%)"]') : null,
        outsideTransform: g ? g.getAttribute('transform') : null,
        outsideChildStrokes: g ? [...g.querySelectorAll(':scope > rect')].map(r => r.getAttribute('stroke')) : null,
        ppc: ppcEl ? ppcEl.textContent.match(/[\\d.]+/)?.[0] : null,
      });
    })()`);
    console.log(`${label}: ${d}`);
  };

  await dump('A. after render ');
  const surf0 = await api.surfaceRect();
  console.log(`   surface: ${JSON.stringify(surf0)}`);

  // B. exact stress drag sequence on P020
  const cal = await api.piecePos('P020', 143.51);
  console.log(`   P020 before: xCm=${cal.xCm.toFixed(2)} screen=(${Math.round(cal.x)},${Math.round(cal.y)}) ppc=${cal.pxPerCm.toFixed(3)}`);
  // click-select first (mirrors stress flow)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(cal.x + 3 * cal.pxPerCm), y: Math.round(cal.y + 3 * cal.pxPerCm) }, 10000);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(cal.x + 3 * cal.pxPerCm), y: Math.round(cal.y + 3 * cal.pxPerCm), button: 'left', clickCount: 1 }, 10000);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(cal.x + 3 * cal.pxPerCm), y: Math.round(cal.y + 3 * cal.pxPerCm), button: 'left', clickCount: 1 }, 10000);
  await sleep(400);
  await dump('B1. after select ');
  const cal2 = await api.piecePos('P020', 143.51);
  console.log(`   P020 after select: xCm=${cal2.xCm.toFixed(2)} ppc=${cal2.pxPerCm.toFixed(3)}`);
  const g = { x: Math.round(cal2.x + 3 * cal2.pxPerCm), y: Math.round(cal2.y + 3 * cal2.pxPerCm) };
  await drag(cdp, g, { x: g.x + Math.round(5 * cal2.pxPerCm), y: g.y });
  await sleep(400);
  await dump('B2. after drag   ');
  const cal3 = await api.piecePos('P020', 143.51);
  console.log(`   P020 after drag: xCm=${cal3.xCm.toFixed(2)} ppc=${cal3.pxPerCm.toFixed(3)} moved=${(cal3.xCm - cal2.xCm).toFixed(2)} cm`);
} finally {
  await cdp?.close();
  await cleanup();
}
console.log('debug probe done');
