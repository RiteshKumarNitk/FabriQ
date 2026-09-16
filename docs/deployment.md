# Deployment — Vercel (from scratch)

This is the complete guide to deploy FabriQ to Vercel **fresh** — after deleting
all Vercel projects. The platform is a monorepo with **two separate apps**, and
each one is its own Vercel project:

| App | Code | Framework | Vercel project |
|---|---|---|---|
| **API** (backend) | `apps/api` | NestJS | `fabri-q` |
| **Web app** (UI/login) | `apps/web` | Next.js | `fabriq` |

> Two Vercel projects is correct and required — Vercel deploys ONE root
> directory per project, and these are two different apps with different
> frameworks, builds, and env vars.

---

## Prerequisites (do once)

- Code pushed to GitHub: `github.com/RiteshKumarNitk/FabriQ` (branch `main`).
- Neon Postgres database exists (the app connects to it; no Vercel DB needed).

---

## Step 1 — Deploy the API first

1. **vercel.com → Add New… → Project** → Import **`RiteshKumarNitk/FabriQ`**.
2. **Root Directory:** select **`apps/api`**.
3. **Framework Preset:** *Other* (or *NestJS* — either works).
4. **Build Command:** leave the default (it reads `apps/api/vercel.json`, which
   builds `@fabriq/shared` → `@fabriq/database` → the API, in the right order).
5. **Start Command:** `node dist/main.js`.
6. **Node.js Version:** `20.x` (package requires `>=20`).
7. **Environment Variables** (all required):

   ```
   DATABASE_URL=postgresql://<user>:<password>@<host>.neon.tech/<db>?sslmode=require
   JWT_ACCESS_SECRET=<strong random, e.g. openssl rand -base64 48>
   JWT_REFRESH_SECRET=<strong random, e.g. openssl rand -base64 48>
   JWT_ACCESS_EXPIRES_IN=15m
   JWT_REFRESH_EXPIRES_IN=7d
   ```

   > Do NOT set `PORT` or `NODE_ENV` — Vercel injects them itself.

8. Click **Deploy**. Note the API URL you get (e.g. `https://fabri-q-xxx.vercel.app`).
9. Verify: open `https://<api-url>/api/v1/health` → should return
   `{"success":true,...}`.

---

## Step 2 — Deploy the web app

1. **Add New… → Project** → Import **`RiteshKumarNitk/FabriQ`** (same repo).
2. **Root Directory:** select **`apps/web`**.
3. **Framework Preset:** *Next.js* (auto-detected).
4. **Build Command:** replace with:

   ```
   pnpm --filter @fabriq/shared build && pnpm build
   ```

   (`@fabriq/shared` ships as gitignored `dist/`, so a fresh clone must build it
   before `next build`.)
5. **Node.js Version:** `20.x`.
6. **Environment Variable** (set BEFORE the first build — it is inlined at
   build time):

   ```
   NEXT_PUBLIC_API_URL=https://<api-url>/api/v1
   ```

   (Use the API URL from Step 1 — e.g. `https://fabri-q-xxx.vercel.app/api/v1`.)
7. Click **Deploy**. Note the web URL you get (e.g. `https://fabriq-xxx.vercel.app`).

---

## Step 3 — Wire the two together (CORS + redirect)

On the **API project** (`fabri-q`) → Settings → Environment Variables, add
(replace `<web-url>` with the web URL from Step 2):

```
WEB_ORIGIN=https://<web-url>
WEB_APP_URL=https://<web-url>
```

- `WEB_ORIGIN` is the CORS allow-list — without it, the browser blocks every
  API call from the web app.
- `WEB_APP_URL` makes the API root (`/`) redirect to the web app login page.
  **Never set it to the API's own domain** — the code also guards against this
  (root then shows the status page instead of looping).

Vercel auto-redeploys the API when env vars change (~1 min).

---

## Done — the final setup

| Thing | URL |
|---|---|
| **Web app (login)** | `https://<web-url>` |
| **API** | `https://<api-url>` |
| **API health** | `https://<api-url>/api/v1/health` |
| **Swagger docs** | `https://<api-url>/api/docs` |
| **Status page** | `https://<api-url>/status` |

Login: `owner@acme.test / Demo@123` (tenant admin) or
`admin@fabriq.local / Admin@123` (platform admin).

---

## If something breaks

- **Web loads but login fails / "Failed to fetch"** → the API URL baked into the
  web build is wrong. Check `NEXT_PUBLIC_API_URL` in the web project's env,
  then **⋯ → Redeploy** (it is only read at build time).
- **Browser console shows a CORS error** → the API's `WEB_ORIGIN` doesn't
  include the web URL. Fix it in the API project env (auto-redeploys).
- **`/` on the API loops or looks dead** → `WEB_APP_URL` points at the API's own
  domain. Set it to the web URL (the code now falls back to the status page
  instead of looping, but fix the env).
- **Build fails on `@fabriq/shared`** → the build command is wrong. API should
  use `apps/api/vercel.json` (default); web should be
  `pnpm --filter @fabriq/shared build && pnpm build`.
- **DB errors on the API** → `DATABASE_URL` is wrong/unset; check the Neon
  connection string and that `sslmode=require` is present.

---

# Deployment — reference (original)

## API (`apps/api`) — NestJS

- **Project settings:** Root directory `apps/api`, Framework preset *Other*, Start
  command `node dist/main.js` (the package.json `start` script).
- **Build is self-contained:** `apps/api/vercel.json` sets the build command to
  build the workspace packages first:
  `pnpm --filter @fabriq/shared build && pnpm --filter @fabriq/database build && pnpm build`
  (the API imports `@fabriq/shared` and `@fabriq/database` from their gitignored
  `dist/` folders, so they must be built before the API's `tsc` run).
- **Environment variables (all required unless noted):**
  - `DATABASE_URL` — Neon Postgres connection string.
  - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — strong random strings.
  - `WEB_ORIGIN` — comma-separated list of allowed web origins, e.g.
    `https://fabriq.vercel.app` (CORS allow-list).
  - `WEB_APP_URL` — public URL of the deployed web app (defaults to
    `https://fabriq.vercel.app`). The API root (`/`) redirects to it, so the
    web app login is the default entry point. Override when using a custom
    domain. NEVER set this to the API's own domain (`fabri-q.vercel.app`) — the
    root becomes a redirect loop.
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
  reject browser requests. Current live API: `fabri-q.vercel.app` (health,
  docs and /status) — the web app must be deployed as its own project and the
  API env gets `WEB_ORIGIN=<web app URL>` + `WEB_APP_URL=<web app URL>`, while
  the web env gets `NEXT_PUBLIC_API_URL=https://fabri-q.vercel.app/api/v1`.

## Local vs. serverless differences to remember

- No filesystem uploads beyond the local `./uploads` dir — move to object storage
  (S3/Cloudinary) before relying on uploaded documents in production.
- Suspended-tenant login enforcement and a few remaining audit items are tracked
  in `docs/audit/rbac-access-audit.md`.
