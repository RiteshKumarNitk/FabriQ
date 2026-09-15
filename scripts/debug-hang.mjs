/**
 * Hang-stack probe: reproduce the marker-canvas main-thread wedge and use
 * Debugger.pause (which CAN interrupt a busy JS loop) to capture the stack.
 *
 * Run: node scripts/debug-hang.mjs
 */
import { Cdp, launchBrowser, loginViaForm, makeCanvasApi, sleep } from './cdp-client.mjs';

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const MARKER_URL = process.argv[2] ?? `${WEB}/cutting/markers/632035e5-54b1-4248-a2a7-f70d69110640`;

const { port, cleanup } = await launchBrowser();
let cdp;
try {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  if (process.env.E2E_OVERRIDE === '1') {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1000, deviceScaleFactor: 1, mobile: false });
    console.log('(Emulation.setDeviceMetricsOverride enabled)');
  }

  const pausedFrames = [];
  cdp.on((msg) => {
    if (msg.method === 'Debugger.paused') {
      pausedFrames.push(...msg.params.callFrames.slice(0, 12).map((f) => `${f.functionName || '(anon)'} @ ${(f.url || '').split('/').pop()}:${f.location.lineNumber + 1}`));
    }
  });
  await cdp.send('Debugger.enable', { maxScriptsCacheSize: 1e7 });

  await loginViaForm(cdp, WEB);
  await cdp.send('Page.navigate', { url: MARKER_URL });
  const deadline = Date.now() + 60000;
  for (;;) {
    const hit = await cdp.send('Runtime.evaluate', { expression: `!!document.querySelector('svg[aria-label="Marker planning canvas"]') && document.querySelector('svg[aria-label="Marker planning canvas"]').textContent.includes('Pocket')`, returnByValue: true });
    if (hit?.result?.value) break;
    if (Date.now() > deadline) throw new Error('canvas never rendered');
    await sleep(200);
  }
  await sleep(500);

  const cal = await makeCanvasApi(cdp).piecePos('Pocket', 143.51);
  const gx = Math.round(cal.x + 4 * cal.pxPerCm);
  const gy = Math.round(cal.y + 4 * cal.pxPerCm);
  console.log(`grab point: ${gx},${gy} (yCm=${cal.yCm.toFixed(1)}, ppc=${cal.pxPerCm.toFixed(2)})`);

  // Sanity: page responsive before the event?
  const t0 = await cdp.send('Runtime.evaluate', { expression: '1+1', returnByValue: true });
  console.log(`pre-event evaluate: ${t0?.result?.value}`);

  // Fire the pointerdown WITHOUT awaiting (it may hang) and pause the debugger.
  cdp
    .send('Runtime.evaluate', {
      expression: `document.elementFromPoint(${gx}, ${gy}).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: ${gx}, clientY: ${gy} })); 'dispatched'`,
      returnByValue: true,
      awaitPromise: false,
    })
    .then((r) => console.log(`pointerdown evaluate completed: ${r?.result?.value}`))
    .catch((e) => console.log(`pointerdown evaluate did not complete: ${e.message}`));

  await sleep(1200);
  await cdp.send('Debugger.pause').catch((e) => console.log(`pause failed: ${e.message}`));
  await sleep(2000);

  if (pausedFrames.length) {
    console.log('\nBUSY STACK captured:');
    for (const f of pausedFrames) console.log(`   ${f}`);
    await cdp.send('Debugger.resume').catch(() => {});
  } else {
    console.log('\nDebugger.pause did NOT interrupt — main thread is NOT running JS');
    console.log('(points to a blocked/nested native call or a pre-event wedge)');
  }

  // Is the page responsive again after resume?
  await sleep(500);
  const t1 = await cdp.send('Runtime.evaluate', { expression: '1+1', returnByValue: true }).catch((e) => null);
  console.log(`post-resume evaluate: ${t1?.result?.value ?? 'STILL HUNG'}`);
} finally {
  await cdp?.close();
  await cleanup();
}
console.log('done');
