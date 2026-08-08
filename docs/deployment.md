# Deployment — Vercel

The platform is designed to run serverless-friendly. Both apps deploy to Vercel as
separate projects in this monorepo.

## API (`apps/api`) — NestJS

- **Project settings:** Root directory `apps/api`, Framework preset *Other*, Start
  command `node dist/main.js` (the package.json `start` script).
- **Build is self-contained:** `apps/api/vercel.json` sets the build command to
  build the workspace packages first:
  `npm run build -w @fabriq/shared && npm run build -w @fabriq/database && npm run build`
  (the API imports `@fabriq/shared` and `@fabriq/database` from their gitignored
  `dist/` folders, so they must be built before the API's `tsc` run).
- **Environment variables (all required unless noted):**
  - `DATABASE_URL` — Neon Postgres connection string.
  - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — strong random strings.
  - `WEB_ORIGIN` — comma-separated list of allowed web origins, e.g.
    `https://fabriq-web.vercel.app` (CORS allow-list).
  - `WEB_APP_URL` — public URL of the deployed web app (defaults to
    `https://fabriq-web.vercel.app`). The API root (`/`) redirects to it, so the
    web app login is the default entry point. Override when using a custom
    domain.
  - `NODE_ENV=production`.
  - `PORT` — optional; Vercel injects its own port, so the app binds to whatever
    is provided.
- **Health check:** `https://<api-domain>/api/v1/health`.
- **Root path** `/` redirects to the web app (login page). The API status/report
  page lives at `/status` (live API status, spec KPIs, links to docs/health).
- **Docs** at `/api/docs` and the raw OpenAPI spec at `/api/docs-json`.

### Swagger docs (`/api/docs`)

The docs page is fully self-contained: the HTML is served as a string and the
OpenAPI spec is generated at runtime (`/api/docs-json`, `/api/docs-init.js`), so it
works on Vercel serverless where `node_modules/swagger-ui-dist` static serving
fails. UI assets load from the jsDelivr CDN (pinned `swagger-ui-dist@5.11.0`) and
the API's CSP (helmet) allows `cdn.jsdelivr.net` for scripts/styles only.

## Web (`apps/web`) — Next.js

- **Project settings:** Root directory `apps/web`, Framework preset *Next.js*
  (auto-detected).
- **Environment variables:**
  - `NEXT_PUBLIC_API_URL` — `https://<api-domain>/api/v1` (used by the API client;
    falls back to `http://localhost:3001/api/v1` locally, which silently breaks a
    production build if unset — set it!).
- Remember to add the web app's origin to the API's `WEB_ORIGIN` or CORS will
  reject browser requests. Example live pair: web at `fabriqjpr.vercel.app`, API
  at `fabri-q-api.vercel.app` → API env `WEB_ORIGIN=https://fabriqjpr.vercel.app`
  and web env `NEXT_PUBLIC_API_URL=https://fabri-q-api.vercel.app/api/v1`.

## Local vs. serverless differences to remember

- No filesystem uploads beyond the local `./uploads` dir — move to object storage
  (S3/Cloudinary) before relying on uploaded documents in production.
- Suspended-tenant login enforcement and a few remaining audit items are tracked
  in `docs/audit/rbac-access-audit.md`.
