/**
 * API status/report page — served at `/status`.
 *
 * The root path no longer shows this page: it redirects to the deployed web
 * app (the login page is the default entry point). Like the docs page, this
 * page is fully self-contained: the HTML is a string and the live status is
 * driven by an external '/api/status.js' file (an inline script would be
 * blocked by the API's strict CSP — no 'unsafe-inline' in script-src).
 */

export const STATUS_JS_PATH = '/api/status.js';

/**
 * Builds the status page. `webAppUrl` is the deployed web app URL (surfaces a
 * "Web App" link in the topbar); `environment` is shown as a small badge in
 * the footer.
 */
export function buildStatusPage(webAppUrl: string, environment: string): string {
  const webAppLink = webAppUrl
    ? `<a href="${webAppUrl}">Web App</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FabriQ API — Status</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧵</text></svg>" />
  <style>
    :root { --navy:#0f172a; --accent:#34d399; --bg:#f1f5f9; --text:#0f172a; --muted:#64748b; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; }
    .topbar { display: flex; align-items: center; gap: 16px; padding: 12px 28px; background: var(--navy); color: #e2e8f0; }
    .logo { font-weight: 700; font-size: 17px; letter-spacing: 0.02em; color: #fff; }
    .logo b { color: var(--accent); }
    .topbar nav { margin-left: auto; display: flex; gap: 10px; }
    .topbar a { color: #cbd5e1; text-decoration: none; font-size: 13px; border: 1px solid #334155; border-radius: 6px; padding: 4px 10px; transition: background 0.15s ease, color 0.15s ease; }
    .topbar a:hover { background: #1e293b; color: #fff; }
    .hero { background: linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #134e4a 130%); color: #fff; padding: 64px 28px 56px; text-align: center; }
    .eyebrow { display: inline-block; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #94a3b8; border: 1px solid #334155; border-radius: 999px; padding: 4px 14px; margin-bottom: 16px; }
    .hero h1 { margin: 0 0 10px; font-size: 42px; letter-spacing: -0.02em; }
    .hero h1 span { color: var(--accent); }
    .tagline { margin: 0 auto 28px; max-width: 640px; color: #cbd5e1; font-size: 16px; line-height: 1.6; }
    .status-pill { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; padding: 7px 16px; font-size: 13px; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: #94a3b8; }
    .dot.ok { background: var(--accent); box-shadow: 0 0 0 4px rgba(52,211,153,0.18); animation: pulse 2s infinite; }
    .dot.down { background: #f87171; box-shadow: 0 0 0 4px rgba(248,113,113,0.18); }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
    main { flex: 1; width: 100%; max-width: 1080px; margin: 0 auto; padding: 36px 28px 56px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 22px; box-shadow: 0 1px 2px rgba(15,23,42,0.05); }
    .card h2 { margin: 0 0 4px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    .big { font-size: 34px; font-weight: 700; letter-spacing: -0.02em; margin: 6px 0 2px; }
    .sub { color: var(--muted); font-size: 13px; }
    .kpis { display: flex; gap: 12px; margin-top: 18px; flex-wrap: wrap; }
    .kpi { flex: 1; min-width: 90px; text-align: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 8px; }
    .kpi .num { font-size: 22px; font-weight: 700; }
    .kpi .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-top: 2px; }
    .card ul { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .card a { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); padding: 9px 12px; border: 1px solid #e2e8f0; border-radius: 9px; font-size: 14px; font-weight: 500; transition: border-color 0.15s ease, background 0.15s ease; }
    .card a:hover { border-color: var(--accent); background: #f0fdf7; }
    .card a .arrow { margin-left: auto; color: var(--muted); }
    footer { text-align: center; padding: 22px; color: var(--muted); font-size: 12px; border-top: 1px solid #e2e8f0; background: #fff; }
    .env { display: inline-block; margin-left: 8px; background: #e2e8f0; border-radius: 999px; padding: 1px 8px; font-size: 11px; }
  </style>
</head>
<body>
  <header class="topbar">
    <span class="logo">FabriQ<b>API</b></span>
    <nav>
      ${webAppLink}
      <a href="/api/docs">API Docs</a>
      <a href="/api/v1/health">Health</a>
    </nav>
  </header>

  <section class="hero">
    <span class="eyebrow">API Status &amp; Service Report</span>
    <h1>FabriQ <span>API</span></h1>
    <p class="tagline">Service health and platform statistics for the FabriQ garment manufacturing platform.</p>
    <span class="status-pill">
      <span class="dot" id="status-dot"></span>
      <span id="status-label">Checking…</span>
      <span id="status-meta" style="color:#94a3b8"></span>
    </span>
  </section>

  <main>
    <div class="grid">
      <div class="card">
        <h2>Platform</h2>
        <div class="big" id="spec-version">v1.0</div>
        <div class="sub">OpenAPI 3.0 — REST API</div>
        <div class="kpis">
          <div class="kpi"><div class="num" id="endpoint-count">—</div><div class="lbl">Endpoints</div></div>
          <div class="kpi"><div class="num" id="tag-count">—</div><div class="lbl">Modules</div></div>
        </div>
      </div>
      <div class="card">
        <h2>Quick Links</h2>
        <ul>
          <li><a href="/api/docs">📖 Interactive API Docs<span class="arrow">→</span></a></li>
          <li><a href="/api/docs-json">📄 OpenAPI Spec (JSON)<span class="arrow">→</span></a></li>
          <li><a href="/api/v1/health">❤️ Health Check<span class="arrow">→</span></a></li>
        </ul>
      </div>
    </div>
  </main>

  <footer>
    FabriQ API — multi-tenant garment manufacturing platform
    <span class="env">${environment}</span>
  </footer>

  <script src="${STATUS_JS_PATH}"></script>
</body>
</html>
`;
}

/**
 * Live-status bootstrap served as a 'self'-hosted file (CSP-safe). Pings the
 * health endpoint and loads the OpenAPI spec to populate the status pill and
 * the platform KPIs.
 */
export const STATUS_JS = `
(function () {
  var dot = document.getElementById('status-dot');
  var label = document.getElementById('status-label');
  var meta = document.getElementById('status-meta');

  function setStatus(ok, ms) {
    if (dot && label) {
      dot.className = 'dot ' + (ok ? 'ok' : 'down');
      label.textContent = ok ? 'Operational' : 'Unreachable';
    }
    if (meta) meta.textContent = ok ? ms + ' ms response' : 'try again shortly';
  }

  fetch('/api/v1/health', { headers: { Accept: 'application/json' } })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function () { setStatus(true, 0); })
    .catch(function () { setStatus(false, 0); });

  fetch('/api/docs-json')
    .then(function (res) { return res.json(); })
    .then(function (spec) {
      var endpoints = document.getElementById('endpoint-count');
      var tags = document.getElementById('tag-count');
      var version = document.getElementById('spec-version');
      if (endpoints) endpoints.textContent = String(Object.keys((spec && spec.paths) || {}).length);
      if (tags) tags.textContent = String(((spec && spec.tags) || []).length);
      if (version && spec && spec.info && spec.info.version) version.textContent = 'v' + spec.info.version;
    })
    .catch(function () {});
})();
`;
