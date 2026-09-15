/**
 * Shared Chrome DevTools Protocol helpers for the dependency-free browser
 * tests (Node ≥ 22 speaks WebSocket natively — no npm dependencies).
 *
 * Used by scripts/marker-canvas-e2e.mjs and scripts/marker-canvas-stress.mjs.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const stats = { passed: 0, failed: 0 };

export function ok(name, cond, detail = '') {
  if (cond) {
    stats.passed++;
    console.log(`  ✔ ${name}`);
  } else {
    stats.failed++;
    console.error(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

export function finish(label) {
  console.log(`\n${label}: ${stats.passed} passed, ${stats.failed} failed`);
  process.exit(stats.failed === 0 ? 0 : 1);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── tiny CDP client over the native WebSocket ──────────────────────────────
export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.listeners.forEach((fn) => fn(msg));
      }
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error(`WebSocket to ${url} failed`)), { once: true });
    });
    return new Cdp(ws);
  }
  send(method, params = {}, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  async close() {
    try {
      this.ws.close();
    } catch {
      /* already gone */
    }
  }
}

/** Poll an in-page expression until truthy or timeout. */
export async function waitFor(cdp, expression, timeoutMs = 15000, label = expression) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
    if (last?.result?.value) return last.result.value;
    await sleep(150);
  }
  throw new Error(`waitFor timeout: ${label} — last value: ${JSON.stringify(last?.result?.value)}`);
}

/** Print the current stage if the whole script runs past `seconds`. */
export function watchdog(seconds, getStage) {
  const timer = setTimeout(() => {
    console.error(`\n✘ watchdog: script still running after ${seconds}s — stage: ${getStage()}`);
    process.exit(2);
  }, seconds * 1000);
  timer.unref?.();
}

/** Evaluate an expression, surfacing in-page exceptions. */
export async function evalIn(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) {
    throw new Error(`In-page error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  }
  return r?.result?.value;
}

// ── browser lifecycle ──────────────────────────────────────────────────────
export function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  throw new Error('No Chrome/Edge found — set CHROME_PATH');
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export async function launchBrowser() {
  const exe = findBrowser();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fabriq-e2e-'));
  // Random free port per launch: a fixed port lets an orphaned browser from a
  // killed run silently own the DevTools endpoint, and every later run then
  // connects to that stale browser and wedges.
  const port = await freePort();
  // HEADLESS_E2E=1 runs headless — sidesteps headed-Chrome input/compositor
  // deadlocks observed on some Windows machines and matches CI conditions.
  const headless = process.env.HEADLESS_E2E === '1' ? ['--headless=new'] : [];
  const child = spawn(exe, [
    ...headless,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1680,1000',
    'about:blank',
  ], { stdio: 'ignore' });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return { child, port, cleanup };
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  await cleanup();
  throw new Error('Browser DevTools endpoint never came up');

  async function cleanup() {
    child.kill();
    if (process.platform === 'win32') {
      // Chrome spawns helper processes; kill the whole tree.
      const { execFile } = await import('node:child_process');
      await new Promise((r) => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => r()));
    }
  }
}

// ── CDP mouse helpers ──────────────────────────────────────────────────────
/**
 * Drag with retry: Input.dispatchMouseEvent is occasionally flaky right
 * after heavy render activity (observed as a CDP send timeout); re-measuring
 * and retrying recovers deterministically.
 */
export async function drag(cdp, from, to, { steps = 12, stepDelayMs = 20, attempts = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y }, 10000);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 }, 10000);
      for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: Math.round(from.x + ((to.x - from.x) * i) / steps),
          y: Math.round(from.y + ((to.y - from.y) * i) / steps),
        }, 10000);
        if (stepDelayMs > 0) await sleep(stepDelayMs);
      }
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(to.x), y: Math.round(to.y), button: 'left', clickCount: 1 }, 10000);
      return;
    } catch (err) {
      lastErr = err;
      // Release any stuck button so the next attempt starts clean.
      try {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 }, 5000);
      } catch { /* best effort */ }
      await sleep(500);
    }
  }
  throw lastErr;
}

// ── app-level helpers ──────────────────────────────────────────────────────
export const CANVAS = `document.querySelector('svg[aria-label="Marker planning canvas"]')`;

/**
 * Synthetic-event drag fallback: dispatches pointer/mouse events straight
 * into the DOM. Proves the COMPONENT's interaction path (pointerdown →
 * window move → up) independently of CDP's Input domain, which occasionally
 * wedges renderer main-thread input dispatch on this canvas.
 */
export async function syntheticDrag(evalJsFn, from, to, { steps = 6, stepDelayMs = 30 } = {}) {
  await evalJsFn(`(() => {
    const el = document.elementFromPoint(${from.x}, ${from.y});
    if (!el) return 'no element';
    const opts = (t) => ({ bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: t === 'down' ? 1 : 0, clientX: ${from.x}, clientY: ${from.y} });
    el.dispatchEvent(new PointerEvent('pointerdown', opts('down')));
    el.dispatchEvent(new MouseEvent('mousedown', opts('down')));
    return 'ok';
  })()`);
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(from.x + ((to.x - from.x) * i) / steps);
    const y = Math.round(from.y + ((to.y - from.y) * i) / steps);
    await sleep(stepDelayMs);
    await evalJsFn(`(() => {
      const el = document.elementFromPoint(${x}, ${y}) ?? document.body;
      const opts = { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: ${x}, clientY: ${y} };
      el.dispatchEvent(new PointerEvent('pointermove', opts));
      el.dispatchEvent(new MouseEvent('mousemove', opts));
      return 'ok';
    })()`);
  }
  await evalJsFn(`(() => {
    const el = document.elementFromPoint(${to.x}, ${to.y}) ?? document.body;
    const opts = { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 0, clientX: ${to.x}, clientY: ${to.y} };
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    return 'ok';
  })()`);
}

/**
 * Login through the REAL form (retry: dev-server hydration can lag, and a
 * native submit before hydration just reloads the page empty).
 */
export async function loginViaForm(cdp, webUrl, { email = 'owner@acme.test', password = 'Demo@123' } = {}) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    await cdp.send('Page.navigate', { url: `${webUrl}/login` });
    await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('#email')`, 30000, 'login form');
    await evalIn(cdp, `(() => {
      const set = (sel, val) => {
        const el = document.querySelector(sel);
        const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('#email', '${email}');
      set('#password', '${password}');
      return 'filled';
    })()`);
    await evalIn(cdp, `document.querySelector('form button[type="submit"]').click()`);
    try {
      await waitFor(cdp, `location.pathname === '/dashboard'`, 20000, `login attempt ${attempt}`);
      return;
    } catch {
      if (attempt === 6) {
        const state = await evalIn(cdp, `JSON.stringify({ href: location.href, toast: document.querySelector('[data-sonner-toast]')?.textContent ?? null, stillOnForm: !!document.querySelector('#email') })`);
        throw new Error(`Login never reached /dashboard after ${attempt} attempts — page state: ${state}`);
      }
      await sleep(1000);
    }
  }
}

/** DOM helpers for the marker editor canvas (View B). */
export function makeCanvasApi(cdp) {
  const js = String.raw; // keep regexes sane inside template strings
  const evalJs = (expression) => evalIn(cdp, expression);

  // Screen rect of the fabric surface. The client rect already includes the
  // outer drawing-group offset and every CSS transform on the way. The
  // surface's vertical extent IS the usable width (widthCm).
  const surfaceRect = () => evalJs(js`
    (() => {
      const svg = ${CANVAS};
      if (!svg) return null;
      const g = svg.querySelector('g[transform]');
      const rect = [...(g?.querySelectorAll('rect') ?? [])].find(r => r.getAttribute('fill') === 'hsl(45 45% 96%)');
      if (!rect) return null;
      const r = rect.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    })()`);

  // A piece's on-screen position: parse translate(X, Y) from its transform
  // attribute (SVG user units == px at current zoom) and offset by the
  // surface's client-rect origin. Also returns the local px/cm calibration.
  const piecePos = async (label, widthCm) => {
    const s = await surfaceRect();
    if (!s) throw new Error('Could not locate the fabric surface rect');
    const ppc = s.height / widthCm;
    const p = await evalJs(js`
      (() => {
        const svg = ${CANVAS};
        if (!svg) return null;
        const g = [...svg.querySelectorAll('g')].find(el => {
          const t = el.querySelector(':scope > text');
          return t && t.textContent.startsWith('${label} ·');
        });
        if (!g) return null;
        const m = /translate\(\s*([-\d.eE+]+)[ ,]+([-\d.eE+]+)/.exec(g.getAttribute('transform') ?? '');
        if (!m) return null;
        return { x: ${s.left} + +m[1], y: ${s.top} + +m[2] };
      })()`);
    if (!p) throw new Error(`Could not locate the ${label} piece on the canvas`);
    return { x: p.x, y: p.y, pxPerCm: ppc, xCm: (p.x - s.left) / ppc, yCm: (p.y - s.top) / ppc };
  };

  // Status bar lookups: the status bar is the last div whose class string
  // contains 'tabular-nums' and whose text contains 'Pieces '.
  const statusOf = (label) => evalJs(js`
    (() => {
      const bars = [...document.querySelectorAll('div')].filter(d => typeof d.className === 'string' && d.className.includes('tabular-nums') && d.textContent.includes('Pieces '));
      const b = bars.at(-1);
      if (!b) return null;
      const text = b.textContent;
      const idx = text.indexOf('${label}' + ' ');
      if (idx < 0) return null;
      const m = /[\d.]+/.exec(text.slice(idx + '${label}'.length + 1));
      return m ? m[0] : null;
    })()`);

  const redOutlines = () => evalJs(js`[...(${CANVAS}?.querySelectorAll('rect[stroke="hsl(0 72% 51%)"][fill="none"]') ?? [])].length`);
  const domNodeCount = () => evalJs(js`${CANVAS} ? ${CANVAS}.querySelectorAll('*').length : 0`);
  const scaleText = () => evalJs(js`(([...document.querySelectorAll('div')].find(d => typeof d.className === 'string' && d.className.includes('px/cm'))?.textContent ?? '').match(/[\d.]+/) ?? [null])[0]`);

  /** What is actually under a screen point inside the canvas, and where is the surface? */
  const hitTest = (x, y) =>
    evalJs(js`
      (() => {
        const el = document.elementFromPoint(${Math.round(x)}, ${Math.round(y)});
        const svg = ${CANVAS};
        const describe = (e) => e ? (e.tagName + (e.getAttribute && e.getAttribute('stroke') ? '[' + e.getAttribute('stroke') + ']' : '') + (e.textContent && e.textContent.length < 24 ? '"' + e.textContent + '"' : '')) : 'null';
        const chain = [];
        let cur = el;
        while (cur && cur !== svg && chain.length < 6) { chain.push(describe(cur)); cur = cur.parentElement; }
        const surf = svg ? [...svg.querySelectorAll('rect')].find(r => r.getAttribute('fill') === 'hsl(45 45% 96%)') : null;
        const sr = surf?.getBoundingClientRect();
        return JSON.stringify({ at: describe(el), chain, surface: sr ? { l: Math.round(sr.left), t: Math.round(sr.top), w: Math.round(sr.width), h: Math.round(sr.height) } : null });
      })()`);

  // Wait for the canvas SVG to exist AND a given piece label to render.
  const waitForCanvas = (pieceLabel = '') =>
    waitFor(
      cdp,
      `!!(${CANVAS})` + (pieceLabel ? ` && ${CANVAS}.textContent.includes('${pieceLabel}')` : ''),
      30000,
      `marker canvas${pieceLabel ? ` with '${pieceLabel}'` : ''}`,
    );
  const waitForToast = (needle, timeoutMs = 15000) =>
    waitFor(cdp, `document.querySelector('[data-sonner-toast]')?.textContent.includes('${needle}')`, timeoutMs, `toast containing '${needle}'`);
  const waitForFinalized = (timeoutMs = 20000) =>
    waitFor(cdp, `document.body.textContent.includes('Finalized — locked for editing')`, timeoutMs, 'finalized state');

  return {
    evalJs,
    js,
    waitForCanvas,
    waitForToast,
    waitForFinalized,
    surfaceRect,
    piecePos,
    statusOf,
    piecesShown: () => statusOf('Pieces'),
    effShown: () => statusOf('Efficiency'),
    redOutlines,
    domNodeCount,
    scaleText,
    hitTest,
  };
}
