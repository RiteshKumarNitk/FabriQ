/**
 * Self-contained Swagger UI page for the FabriQ API.
 *
 * The page is rendered as a plain string (no static files, no swagger-ui-dist)
 * so it works on any host — including Vercel serverless functions, where
 * SwaggerModule.setup's static assets (served from node_modules/swagger-ui-dist
 * via express.static) 404 because the deployment filesystem differs from the
 * build machine.
 *
 * All UI assets are loaded from the jsDelivr CDN (pinned version), and the
 * OpenAPI spec itself is fetched from the sibling /api/docs-json endpoint.
 * The API's helmet CSP must allow cdn.jsdelivr.net for scripts/styles — see
 * the helmet() configuration in main.ts.
 */

const SWAGGER_UI_VERSION = '5.11.0';
const CDN = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;

/** Where the raw OpenAPI 3.0 document is served from (registered in main.ts). */
export const DOCS_JSON_PATH = '/api/docs-json';

/** Where the Swagger UI bootstrap script is served from (registered in main.ts). */
export const DOCS_INIT_JS_PATH = '/api/docs-init.js';

/**
 * Bootstraps Swagger UI. Kept as a separate 'self'-served file (not inline)
 * so it passes the API's strict CSP (script-src 'self' + CDN, no unsafe-inline).
 */
export const DOCS_INIT_JS = `
(function () {
  window.onload = function () {
    window.ui = SwaggerUIBundle({
      url: '${DOCS_JSON_PATH}',
      dom_id: '#swagger-ui',
      deepLinking: true,
      docExpansion: 'list',
      filter: true,
      displayRequestDuration: true,
      persistAuthorization: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      layout: 'StandaloneLayout',
    });
  };
})();
`;

export const DOCS_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FabriQ API — Swagger UI</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧵</text></svg>" />
  <link rel="stylesheet" type="text/css" href="${CDN}/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    body { margin: 0; background: #f6f7f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .fb-topbar {
      display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
      padding: 12px 24px; background: #0f172a; color: #e2e8f0;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
    }
    .fb-logo { font-weight: 700; font-size: 18px; letter-spacing: 0.02em; color: #fff; }
    .fb-logo-accent { color: #34d399; }
    .fb-tagline { font-size: 13px; color: #94a3b8; }
    .fb-spacer { flex: 1; }
    .fb-link { font-size: 13px; color: #cbd5e1; text-decoration: none; border: 1px solid #334155; border-radius: 6px; padding: 4px 10px; transition: background 0.15s ease, color 0.15s ease; }
    .fb-link:hover { background: #1e293b; color: #fff; }
    #swagger-ui { margin: 0 auto; max-width: 1460px; padding: 8px 20px 48px; }
  </style>
</head>
<body>
  <header class="fb-topbar">
    <span class="fb-logo">FabriQ<span class="fb-logo-accent">API</span></span>
    <span class="fb-tagline">OpenAPI 3.0 — interactive reference</span>
    <span class="fb-spacer"></span>
    <a class="fb-link" href="${DOCS_JSON_PATH}">Raw spec (JSON)</a>
    <a class="fb-link" href="/api/v1/health">Health</a>
  </header>

  <div id="swagger-ui"></div>

  <script src="${CDN}/swagger-ui-bundle.js"></script>
  <script src="${CDN}/swagger-ui-standalone-preset.js"></script>
  <script src="${DOCS_INIT_JS_PATH}"></script>
</body>
</html>
`;
