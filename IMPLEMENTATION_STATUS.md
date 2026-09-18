# FabriQ — Implementation Status (factual snapshot)

Date: 2026-09-17 · Repo: `FabriQ` (pnpm monorepo: `apps/api`, `apps/web`, `packages/database`, `packages/shared`)

Everything below was verified by reading the actual source. Items that could not be verified by execution are marked **Not verified**.

---

## 1. Executive Summary

FabriQ is a multi-tenant garment-manufacturing SaaS: platform → tenants → companies/factories, with **procurement** (supplier → PR → PO → GRN → 4-point inspection → warehouse receipt → stock) and a **cutting room** (fabric rolls with a transaction ledger → measurements/defects → markers with SVG canvas → cut orders → lay plans → actual cutting → consumption/waste).

- **Working end-to-end today (by code):** auth + RBAC + tenant isolation, the full procurement chain, and the full fabric → roll → measurement/defect → marker → lay → cut → ledger chain, including concurrency-safe ledger writes.
- **Usable UI:** 42 pages; admin CRUD for 15 entity types (incl. Fabrics); dedicated detail pages for rolls, markers (canvas editor), cut orders, lays, patterns, and all procurement docs.
- **V1 gap closure (2026-09-17):** Fabric master, Pattern library (versioned sets/pieces + apply-to-marker), Remnant close-out workflow + inventory, lay-plans index page and surface plan calculator added; 4-point inspection rewritten to the **verified 4-Point System** (size-based points, length+width normalization) with a unit-tested shared engine; size-wise fulfillment extracted to shared code. Verified by 60 unit checks + 79 e2e checks (all passing against the local build).
- **Broken / incomplete:** the four Platform pages are explicit placeholders. Deployment env mistakes (CORS/API URL) knock out *all* APIs at once. *(Fixed 2026-09-16: Master Data Items and Workflow Definitions admin CRUDs now hit real routes, the Permissions page is a dedicated catalog UI, and the cutting list pages' status filters + sorting are honored server-side.)*
- **Live deployment (verified 2026-09-17):** the API (`fabri-q-api.vercel.app`) is healthy with correct CORS and DB connectivity; **both apps are running stale builds** — the web bundle has no API client at all and the API lacks every fix from 2026-09-16/17. **Both projects must be redeployed from latest main.** `https://fabriq.vercel.app` is a different (unrelated e-commerce) project.

---

## 2. Current Architecture (what exists)

| Layer | Reality |
|---|---|
| **Frontend** | Next.js 14 App Router (`apps/web`), client components, TanStack table, react-hook-form + zod, Tailwind, lucide, sonner. Auth session in localStorage + `fabriq_auth` cookie; `middleware.ts` redirects unauthenticated page loads to `/login`. API client `src/lib/api.ts` wraps fetch, attaches bearer, auto-refreshes once on 401, unwraps `{ success, data, meta }`. |
| **Backend** | NestJS 10 (`apps/api`), global prefix `api/v1`, Swagger at `/api/docs`, helmet CSP, CORS allow-list from `WEB_ORIGIN`, global `ValidationPipe(whitelist)`, ThrottlerGuard **120 req/min per IP**, exception filter → standard error envelope. |
| **Database** | PostgreSQL (Neon per docs) via Prisma 5. `packages/database/prisma/schema.prisma` — 40+ models, all business tables carry audit columns + soft delete + `version`. |
| **Auth** | JWT access (15m) + rotating refresh tokens (`RefreshToken` rows), bcrypt hashes, `@Public()` routes: login/refresh/logout/health. |
| **Multi-tenancy** | Prisma client extension (`packages/database/src/client.ts`) injects/stamps `tenantId` on 30+ scoped models — queries cannot cross tenants; request context flows via AsyncLocalStorage (`TenantContextInterceptor`). |
| **RBAC** | Permission catalog in `packages/shared/src/permissions.ts` (single source of truth, synced to DB). `JwtAuthGuard` → `RbacGuard` enforces `@Permissions('module:action')`; platform-admin bypass; `platform:*` codes refused to tenant users. Role matrix per tenant role in `tenant-provision.ts`. |
| **File storage** | `FileService` facade with two drivers selected by `STORAGE_DRIVER`: `local` (dev, default) and `cloudinary` (Cloudinary raw/byte-exact resources via the official `cloudinary` SDK; boot fails fast if the driver is selected without credentials). Downloads stream auth-gated through the API. |
| **Key services** | `CrudService` + `buildListArgs` (search/sort/filter/pagination for all admin entities), `NumberingService` (PR/PO/GRN/INSP/WR/R/MK/CO/LP/CT per-tenant sequences), `MarkersService` (server-authoritative geometry), `FabricRollsService` (ledger + segment engine), `ProductionService` (lays/cuts with `SELECT … FOR UPDATE` row locks). |
| **Shared engine** | `packages/shared/src/cutting.ts` — units, marker math (length/areas/efficiency/garments-per-marker), lay math, roll ledger summary, segment partition, placement validation — plus `inspection.ts` (verified 4-Point System scoring) and `production.ts` (size-wise fulfillment). Frontend re-runs them for live UX; **API re-runs them server-side** (authoritative). All are unit-tested. |

---

## 3. Implemented Modules

| Module | Status | What actually works | Main files |
|---|---|---|---|
| Auth | ✅ Complete | login/refresh/logout/me, rotating refresh tokens, forced password fields, demo users via seed | `apps/api/src/auth/*`, `apps/web/src/lib/auth-context.tsx` |
| Tenants (platform) | ✅ Complete | CRUD + stats + provisioning of roles/settings on create; platform-admin gated | `modules/tenants/*`, `modules/platform/*` |
| Company / Factory / Warehouse | ✅ Complete | CRUD + archive via generic admin UI | `modules/companies|factories|warehouses`, `lib/entities.ts` |
| Org units (Dept/Section/Line) | ✅ Complete | CRUD + tree endpoint | `modules/org-units/*` |
| Users / Roles / Permissions | ✅ Complete | CRUD, role-permission editing, reset-password, read-only catalog (dedicated searchable `/admin/permissions` UI) | `modules/users`, `modules/roles`, `modules/permissions` |
| Settings / Master Data | ✅ Complete | Settings GET/PUT grouped ✔; categories CRUD ✔; items CRUD via flat `/master-data/items` endpoints (added for the admin UI) | `modules/settings`, `modules/master-data` |
| Documents | ✅ Complete | upload/list/download/delete; **persists on serverless hosts** via the `cloudinary` storage driver (`STORAGE_DRIVER=cloudinary` + Cloudinary credentials on Vercel) | `modules/documents`, `common/file.service.ts` |
| Audit / Notifications / Comments | ✅ Complete | Interceptor-written audit log; unread count, read/read-all; entity comments | `common/audit.interceptor.ts`, `modules/audit|notifications|comments` |
| Workflows | ✅ Complete | Engine complete (definitions/steps/instances/tasks + act-on-task), PR-APPROVAL seeded; definition CRUD wired to `/workflows/definitions` with a `/workflows` list alias | `modules/workflows/*` |
| Procurement | ✅ Complete | Suppliers, PR (+submit/convert), PO (+approve), GRN (+confirm/cancel), 4-point inspection (auto scoring + decision), warehouse receipt (posts stock IN), stock balances/transactions | `modules/procurement/*`, `modules/stock/*` |
| Fabric Roll | ✅ Complete | CRUD (unit-aware), multi-point measurement (updates min/max/avg/usable), defects (split segments), manual adjustments, summary, timeline segments | `modules/cutting/fabric-rolls.*` |
| Marker | ✅ Complete | CRUD, duplicate, **finalize with server-side placement validation + immutable revision snapshots**, plan-calculator | `modules/cutting/markers.*` |
| Cutting (orders/lays/actuals) | ✅ Complete | Cut orders (+approve/fulfillment roll-up), lay plans (reserved span, first-fit, defect check, cancel→release, **list search + whitelisted sort**), cut operations (CONSUMED + WASTE ledger, row-locked) | `modules/cutting/production.*` |
| Fabrics (master) | ✅ Complete | CRUD + archive: code/name/type/composition/GSM/default width + unit/description/active; `FabricRoll.fabricId` link (rolls keep free-text identity fields for compatibility). Admin registry entry | `modules/fabrics/*` |
| Pattern library | ✅ Complete | `/pattern-sets` CRUD with pieces, `POST /:id/revisions` (v2 = NEW row deep-copying pieces, `supersedesId` chain), `POST /:id/apply-to-marker` (first-fit placement of set pieces) | `modules/patterns/*` |
| Remnants | ✅ Complete | Close-roll → remnant (`POST /fabric-rolls/:id/close-roll`), inventory list/get/patch, REMNANT ledger rows + REMNANT segment spans, **remnant-sourced lays/cuts** (see §4) | `modules/cutting/remnants.*` |
| Dashboard | ✅ Complete | Tenant KPI summary + platform summary | `modules/dashboard`, `modules/platform` |
| Platform billing (subscriptions/licenses) | ❌ Not implemented | Placeholder pages only | `app/(app)/platform/[section]/page.tsx` |

---

## 4. Fabric / Roll / Cutting functionality

| Item | Status | What is actually implemented |
|---|---|---|
| Fabric master | ✅ Complete | `Fabric` master (code/name/type/composition/GSM/default width + unit/description, active/archived) with `FabricRoll.fabricId`; existing free-text roll fields kept and auto-filled when a fabric is linked. No Fabric Variant entity (YAGNI — color/lot remain per-roll, which matches the business model). |
| Fabric roll / thaan | ✅ Complete | `FabricRoll` with per-tenant numbering `R-…`, identity fields, GSM, weight, shade lot, GRN link (`grnRollId`) — **rolls are now auto-created from inspected GRN rolls when a warehouse receipt is posted** (same transaction, idempotent on re-receive; `FabricRollsService.createFromGrnRoll`). |
| Roll length / original length | ✅ Complete | `originalLengthCm` (base cm), unit-aware create/update (`lengthUnit`). |
| Fabric width / usable width | ✅ Complete | `widthCm` + `usableWidthCm`, validation usable ≤ nominal, per-measurement readings (begin/middle/end + extras), selvedge logic in marker validation. |
| Fabric measurement | ✅ Complete | `POST /fabric-rolls/:id/measurements`; writes `FabricMeasurement`, updates roll min/max/avg/usable, appends MEASURED ledger row (0 qty). |
| Roll balance | ✅ Complete | `remainingLengthCm` maintained by ledger writers; `GET /fabric-rolls/:id/summary` recomputes via `summarizeRoll()` (original − consumed − waste − remnant; available = remaining − reserved). |
| Roll segments | ✅ Complete | `FabricSegment` partition (AVAILABLE/RESERVED/CONSUMED/DEFECT/…) rebuilt idempotently after every mutation; rendered to scale in the roll timeline UI. |
| Defects | ✅ Complete | CRUD + archive; defect spans carved out of AVAILABLE segments; severity/type/status. |
| Roll transactions (ledger) | ✅ Complete | Append-only `RollTransaction` (MEASURED/RESERVED/RELEASED/CONSUMED/DEFECT_MARKED/WASTE/REMNANT/ADJUSTMENT) with signed qty + balance-after; UI ledger table on roll detail. Concurrency proven by `scripts/ledger-concurrency.mjs` (row locks; **Not verified against live DB**). |
| Marker | ✅ Complete | `Marker` + `MarkerPiece`; create/edit/duplicate/archive; finalize blocked on OUTSIDE_WIDTH/OUTSIDE_MARKER/OVERLAP; CROSSES_DEFECT surfaced; every finalize writes `MarkerRevision` snapshot. |
| Marker length | ✅ Complete | Auto-derived from farthest piece + `endAllowanceCm` (shared `deriveMarkerLength`), manual override; **length is never multiplied by ply**. |
| Pattern pieces | ✅ Complete | Pattern library: `PatternSet` (code/style/name/version/description/status) + `PatternPiece` (name/size/W×H/qty/grain/rotation/mirror/seam/matching/notes). `POST /pattern-sets/:id/revisions` creates v2 as a **NEW row** copying pieces (supersedes chain) — a marker referencing v2 is never altered by v3; markers also keep finalize-time `MarkerRevision` snapshots. `apply-to-marker` places set pieces on a marker (first-fit). UI: list, new (set + piece rows), detail (pieces, revisions, apply). |
| Size ratio | ✅ Complete | `sizeRatioJson` editor in marker UI; server recomputes. |
| Garments per marker | ✅ Complete | Σ positive size-ratio quantities (shared `garmentsPerMarker()`), recomputed on every save server-side. |
| Marker efficiency | ✅ Complete | `efficiencyPct = patternArea / markerArea × 100` (cap 100), server-authoritative on save/finalize; same formula live in editor. |
| Lay | ✅ Complete | `LayPlan`: reserves marker length inside one AVAILABLE segment (`FOR UPDATE` lock, overlap + containing-segment + defect checks), first-fit or explicit `markerStartCm`, cancel → RELEASED — **or on a remnant piece** (`remnantId`, open-end consumption, no segment checks needed since the piece is defect-free by construction) |
| Ply | ✅ Complete | Ply multiplies **output** only (`theoreticalPieces = garmentsPerMarker × ply`), never fabric length — enforced in shared `calculateLay`. |
| Cut order | ✅ Complete | `CutOrder` with `requiredJson` per size, approve flow, status auto-sync from lays, archive blocked when lays exist. |
| Actual cutting | ✅ Complete | `complete-cutting` → `CutOperation` (actual length/pieces/rejected/waste, markerStart/End), single-winner per lay, affordability check vs remaining fabric inside the lock. |
| Fabric consumption | ✅ Complete | CONSUMED + WASTE ledger rows; roll `remainingLengthCm` decremented transactionally; never negative (validated). |
| Waste | ✅ Complete | `wasteLengthCm` per cut → WASTE ledger rows + waste area shown on markers. |
| Remnant | ✅ Complete | `POST /fabric-rolls/:id/close-roll` converts the remaining usable fabric into a `Remnant` (RM-… number, parent roll, source span, inherited identity/widths, location) in one transaction: blocks active roll lays, requires a contiguous leftover (ledger balance is authoritative), writes a REMNANT ledger row, flips remaining→0 to CLOSED, rebuilds segments with a REMNANT span. Partial close (`lengthCm`) cuts a shorter remnant off the last AVAILABLE span. Distinct states enforced: remaining roll (attached) vs remnant (separated) vs waste. Inventory: searchable list (status filter + sort) + status/location updates. UI: `/cutting/remnants` + close-roll dialog on the roll detail page. |
| Remnant as fabric source | ✅ Complete | Lays can be planned **on a remnant** (`POST /lay-plans` with `remnantId`, the parent roll still identifies the fabric): open-end consumption — the lay sits at the piece's current front on the parent coordinate axis, the piece flips PLANNED while its lay is open, and recording the cut **shrinks the piece** (source span advances by actual+waste; leftover stays AVAILABLE for the next lay). A fully consumed piece detaches: the parent ledger records the REMNANT+CONSUMED rows exactly once (no double-count — the piece was already detached at close-out). One active lay per remnant; cancel releases the hold (PLANNED→AVAILABLE, length intact). Lay/cut lists include the remnant; `/lay-plans?remnantId=` filter. UI: "From remnant (optional)" picker in the cut-order lay form (filtered to the selected roll) + a remnant badge on lay rows. |
| Planned vs actual | ✅ Complete | Cut-order fulfillment table: per size required / planned (ratio×ply) / actual (share of actual sets by marker mix — **never copied from planned**) / short / excess; roll `cutQtyPlanned` vs `cutQtyActual`. Extracted to shared `computeFulfillment` and unit-tested. |

---

## 5. Database Reality

All models in `packages/database/prisma/schema.prisma` are **actively used** unless noted. Tenant scoping enforced in `client.ts`.

- **Platform/org:** `Tenant`, `Company`, `Factory`, `Warehouse`, `Department`, `Section`, `ProductionLine` — all used (tenant provisioning seeds a demo tree).
- **Identity:** `User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `RefreshToken` — used; permission catalog synced from shared code.
- **Ops:** `AuditLog` (interceptor-written), `Setting`, `MasterDataCategory` (used), `MasterDataItem` (model used; admin UI fixed via flat `/master-data/items` endpoints), `Document`, `Notification`, `Comment`, `WorkflowDefinition/Step/Instance/Task` (used; instance creation is manual from detail pages).
- **Procurement:** `DocumentSequence`, `Supplier`, `PurchaseRequisition(+Item)`, `PurchaseOrder(+Item)`, `GoodsReceiptNote`, `GrnRoll`, `FabricInspection(+Defect)` (defects gained `sizeCm` + `defectType` feeding the verified 4-Point scoring), `WarehouseReceipt`, `StockTransaction` — used; PO totals (`subTotal/taxAmount/totalAmount`) computed on create/update; `receivedQty` maintained by `recalcReceipts`.
- **Cutting:** `Fabric` (new master), `FabricRoll` (+ `fabricId`, `sourceStart/EndCm` for remnant tracing), `FabricMeasurement`, `FabricSegment`, `FabricDefect`, `RollTransaction`, `Remnant` (new, + `sourceRoll` relation), `Marker`, `MarkerPiece`, `MarkerRevision`, `CutOrder`, `LayPlan`, `CutOperation` — all actively used.
- **Pattern library:** `PatternSet` (now with `version` + `supersedesId`) / `PatternPiece` — managed via `/pattern-sets` (pieces created explicitly with tenantId).

---

## 6. API Reality (implemented routes)

All under `/api/v1`. Envelope `{ success, data, meta? }`. ✅ = implemented and matched by the UI; ⚠️ = exists but UI calls a **different path** (see §10).

- **auth:** POST `/login`, `/refresh`, `/logout`; GET `/me`
- **system:** GET `/health`; GET `/status`, `/api/docs`, `/api/docs-json` (public)
- **tenants (platform):** GET/POST `/tenants`, GET/PATCH/POST-archive `/tenants/:id`, GET `/tenants/:id/stats`
- **org:** `/companies`, `/factories`, `/warehouses` (list/get/create/patch/archive); `/org-units` + `/departments|sections|lines` (CRUD + `/tree`)
- **identity:** `/users` (+`/:id/reset-password`), `/roles` (+`PUT /:id/permissions`), `/permissions` (grouped catalog)
- **config:** GET/PUT `/settings`; `/master-data/categories` CRUD; `/master-data/items` (GET list, GET `/:id`, POST with `categoryId` in body), `/master-data/items/:id` PATCH/archive, plus nested `/master-data/categories/:id/items`
- **docs/comments:** POST `/documents/upload`, GET `/documents`, GET `/documents/:id/download`, DELETE `/documents/:id`; `/comments` GET/POST/DELETE
- **audit:** GET `/audit` (filters: module, entityType, entityId, action, userId)
- **notifications:** GET `/notifications`, `/unread-count`, PATCH `/:id/read`, POST `/read-all`
- **workflows:** definitions via GET `/workflows` and GET `/workflows/definitions` (aliases), GET/PATCH `/workflows/definitions/:id`, POST `/workflows/definitions`, POST `/workflows/definitions/:id/archive`; `/workflows/instances` (GET list/detail, POST), `/workflows/tasks` (GET mine, POST `/:id/action`)
- **procurement:** `/suppliers` CRUD; `/requisitions` (+submit/cancel/convert); `/purchase-orders` (+approve/cancel/archive, recalc receipts); `/goods-receipts` (+confirm/cancel/archive); `/inspections` (+`pending-rolls`); `/warehouse-receipts` (+`approved-rolls`); `/stock/transactions`, `/stock/balances`
- **cutting:** `/fabric-rolls` CRUD + `/:id/summary|measurements|defects(+/defectId, archive)|adjustments|close-roll`; `/markers` CRUD + `/plan-calculator|/:id/duplicate|finalize|archive|pieces`; `/cut-orders` (+approve/archive); `/lay-plans` (+cancel, `/lay-plans/:id/complete-cutting`; list supports `search` + whitelisted `sortBy`/`sortOrder`); `/remnants` (list with search/status-filters/sort, get, patch); GET `/fabric-rolls/:rollId/available-slots`
- **fabric & patterns:** `/fabrics` CRUD (+archive); `/pattern-sets` CRUD + `/:id/revisions` + `/:id/apply-to-marker`

---

## 7. UI Reality (42 pages)

**Functional pages**
- `/login` — login form with demo credentials ✔
- `/dashboard` — tenant KPI grid (org + procurement cards), recent audit/notifications; platform admins get a separate platform dashboard (tenants, resources, audit) ✔
- `/admin/[entity]` + `/admin/[entity]/[id]` — generic list/detail/create/edit/archive for 14 registry entities (tenants, companies, factories, warehouses, departments, sections, lines, users, roles, permissions, master-data, master-items, workflow-definitions, suppliers), with search/sort/pagination/filters/CSV export, activity panel (audit/comments/documents/approval) ✔ — **except the two broken registries below**
- `/cutting/rolls` (list) · `/cutting/rolls/new` · `/cutting/rolls/[id]` — KPI tiles, **to-scale roll timeline** with clickable spans, measurement form, defect form, full ledger table, activity ✔
- `/cutting/markers` (list) · `/cutting/markers/new` (piece rows + live stacked placement preview) · `/cutting/markers/[id]` — **SVG marker canvas** (drag/resize/rotate/duplicate/delete, snap, undo/redo, zoom/pan/fit, rulers, defect overlay, live efficiency/waste), size-ratio editor, property panel, revisions list, Save + Finalize ✔
- `/cutting/cut-orders` (list) · `/new` (size rows) · `/[id]` — fulfillment-by-size table, lay planning form (marker+roll+ply → reserve fabric), per-lay record-cutting dialog, approve, cancel lay ✔
- `/cutting/lay-plans` — **new index page** (Lay ID, cut order, marker, roll, ply, marker length, output, status, created; search/status/sort/pagination via the shared list component) ✔
- `/cutting/lay-plans/[id]` — lay detail: size mix, theoretical output, position on roll, cut operations ✔
- `/cutting/patterns` (list) · `/new` (set + piece rows) · `/[id]` (pieces, revisions chain, apply-to-marker) ✔ *(new 2026-09-17)*
- `/cutting/remnants` — remnant inventory (search/status filter/sort) ✔ *(new)*
- `/cutting/plan-calculator` — **ESTIMATED/PLANNED-only** planner: required qty + size ratio + marker length + garments/marker + ply → output/lay, lays required, estimated fabric; writes nothing ✔ *(new)*
- `/cutting/rolls/[id]` gained a **Close roll → create remnant** dialog ✔ *(new)*
- `/procurement/*` — requisitions, purchase-orders, goods-receipts, inspections, warehouse-receipts: list + `new` wizard-style forms + detail pages with confirm/approve/convert actions and cross-links ✔; `/procurement/stock` balances + transactions ✔
- `/tasks` (approve/reject workflow tasks) · `/notifications` · `/audit` (filterable) · `/settings` (grouped editable settings) ✔

**Placeholder / broken pages**
- ❌ **`/platform/subscriptions`, `/platform/licenses`, `/platform/settings`, `/platform/config`** — rendered "In development" placeholders (sidebar intentionally shows them).
- ✅ **`/admin/master-items`** — fixed: backend now exposes flat `/master-data/items` (list/get/create with `categoryId` in body) matching the generic admin contract; PATCH/archive already existed.
- ✅ **`/admin/workflow-definitions`** — fixed: config points at `/workflows/definitions`; backend serves `GET /workflows/definitions` (list alias) alongside `GET /workflows`.
- ✅ **`/admin/permissions`** — fixed: dedicated read-only catalog page (grouped by module, searchable) rendering the grouped `/permissions` payload that the role form also consumes; static route shadows `/admin/[entity]`.

**Linking:** all audited internal links (`sidebar`, dashboard cards, platform dashboard, data-table "View", roll↔lay↔marker↔cut-order cross-links, GRN→inspection/warehouse-receipt, PO→GRN, requisition→PO) resolve to existing pages. No dead links found.

---

## 8. Calculations Currently Implemented

All formulas live in `packages/shared/src/cutting.ts` (shared) and are **recomputed server-side** on save/finalize — backend-authoritative.

| Calculation | Formula | Where | Authority |
|---|---|---|---|
| Unit conversion | cm ↔ mm/m/in/ft (`toBase`/`fromBase`) | shared; UI render-time | Server stores base cm |
| Marker length | max piece AABB maxX + `endAllowanceCm` | shared `deriveMarkerLength`; marker editor + service | Server on save |
| Marker/pattern/waste area | `Σ w×h`; `length × width`; difference | shared `calculateMarker` | Server on save/finalize |
| Marker efficiency | `patternArea / markerArea × 100` (≤100) | shared; editor live + server | **Server-authoritative** |
| Garments per marker | `Σ max(0, floor(sizeRatio[size]))` | shared `garmentsPerMarker` | Server |
| Lay output | `garmentsPerMarker × ply` (fabric = marker length, ply never multiplies fabric) | shared `calculateLay`; production service | Server |
| Lays required / fabric for lays | `ceil(required / (gpm × ply))`; `lays × markerLength` | shared (used by plan-calculator) | Server |
| Roll remaining | original − Σ(CONSUMED+WASTE+REMNANT); available = remaining − reserved | shared `summarizeRoll` + ledger writes | **Server (ledger)** |
| Planned vs actual per size | planned = ratio×ply; actual = share of actual sets by marker mix; short/excess vs required | `production.service.ts fulfillment()` | Server |
| Cut-order totals | Σ across fulfillment map | UI (`totals`) from server data | Server-computed source |
| 4-point inspection | **Verified 4-Point System** (`shared/inspection.ts`, recomputed server-side): size→points — ≤3"=1, 3–6"=2, 6–9"=3, >9"=4; **holes/open seas = 4 max** regardless of size; per-defect `sizeCm` converted to inches at the roll's width unit; **normalized per 100 m²** — `pts/100m² = Σpoints × 9144 / (length_cm × width_cm)` (i.e. ×100 per linear meter × width in inches); `quality = max(0, 100 − pts/100m²)`; ≤15 APPROVED / ≤30 SECOND / else REJECTED. Both the old per-meter formula and the caller-supplied-points shortcut were rejected as non-standard (see test log §12). | `shared/inspection.ts` + `inspections.service.ts` | **Server** |
| PO money | `subTotal = Σ qty×rate`; `gstAmount`; `totalAmount = subTotal + tax − discount` | PO service + seed | Server |
| Stock balance | Σ IN − Σ OUT per warehouse+item | `stock.service.ts` | Server |
| Defect span available fabric | remaining − Σ(endCm−startCm) | roll detail UI (display) | Frontend display only |

Missing calculations: roll weight auto-derivation from GSM (field accepted, not computed), per-ply fabric shrinkage/overconsumption %, marker "consumption per garment" (derivable but not surfaced).

---

## 9. End-to-End Workflows

| Workflow | Status | Notes |
|---|---|---|
| Tenant provisioning → login → RBAC-gated UI | ✅ Works | Seed or platform admin creates tenant; roles/settings provisioned. |
| Supplier → PR → submit → convert → PO → approve | ✅ Works | Includes numbering + received-qty recalc. |
| PO → GRN (rolls) → confirm → 4-point inspection → warehouse receipt → stock IN → balances → cutting FabricRoll auto-created | ✅ Works | Roll status transitions enforced; stock posted transactionally; the cutting roll is created in the same transaction as the receipt; archive reverses the receipt and the roll is reused on re-receive. |
| Fabric roll → measure → defects → marker (canvas) → finalize → cut order → approve → lay plan (reserve) → record cutting → ledger CONSUMED → remaining updated → fulfillment actuals | ✅ Works (code + scripts) | The full chain exists with server-side validation at every step. `scripts/cutting-e2e.mjs`, `scripts/marker-canvas-e2e.mjs`, `scripts/marker-canvas-stress.mjs` (210 pieces), `scripts/ledger-concurrency.mjs` cover it. **Not verified against the live deployment.** |
| Roll auto-created from GRN rolls | ✅ Works | Receiving an inspected roll into a warehouse (`POST /warehouse-receipts`) auto-creates the `FabricRoll` inside the same transaction — identity (fabric/color/gsm/width/length/lot), supplier ref, full AVAILABLE segment, `IN_STOCK`, per-tenant `R-…` number, linked via `grnRollId`. Idempotent: an existing roll for the same GRN roll is reused. WR detail page links to the created roll. |
| Fabric master → rolls | ✅ Works | `/fabrics` CRUD; a roll created with `fabricId` inherits name/type/GSM/width defaults. e2e-verified locally. |
| Pattern set → revision v2 → apply-to-marker | ✅ Works | v2 is a new row (supersedes chain, pieces deep-copied); markers referencing v2 are untouched by later revisions; apply-to-marker places pieces first-fit. e2e-verified locally. |
| Close roll → remnant → inventory → cut the remnant | ✅ Works | Ledger-authoritative close-out creates the remnant, REMNANT ledger row, REMNANT segment, closes the roll at 0; partial close supported; active roll lays block close. Remnant-sourced lay → cut shrinks the piece (open-end), fully-consumed piece detaches to the parent ledger exactly once, cancel releases the hold. e2e-verified locally (full + guard rails). |
| Approval workflow auto-start (e.g. PR submit → instance) | 🟡 Partial | Engine + tasks UI work; starting an instance is a manual button on entity detail pages, not automatic on submit. |

---

## 10. Why "many APIs fail" on the live deployment

### A. Code-level API mismatches — FIXED (2026-09-16)
1. ✅ **Master Data Items page** — backend now exposes `GET/POST /master-data/items` and `GET /master-data/items/:id` (create takes `categoryId` in the body); PATCH/archive by item id already existed. Typechecked.
2. ✅ **Workflow Definitions page** — UI config now targets `/workflows/definitions…`; `GET /workflows/definitions` added as a list alias. Typechecked.
3. ✅ **Permissions page** — replaced the generic paginated table with a dedicated catalog page that renders the grouped-by-module payload (searchable, per-module counts).

### B. Functional bugs — status filters FIXED (2026-09-16)
4. ✅ **Status filters ignored on cutting lists** — `/fabric-rolls`, `/markers`, `/cut-orders` now parse the UI's `filters={"status":…}` JSON (via shared `common/list-filters.ts` with field whitelists + reserved-key protection) and support `sortBy`/`sortOrder` against per-endpoint whitelists; the bare `status=` param still works for API compatibility. `ProcurementListPage` gained clickable asc→desc→clear column sorting. Remaining (minor): inspection/GRN/warehouse-receipt lists use a different component; no backend fix needed there unless the same convention is adopted.

### C. Deployment-level causes — LIVE-VERIFIED 2026-09-17
Live probes (read-only HTTP): the API at `https://fabri-q-api.vercel.app` is **healthy** — `/api/v1/health` 200, DB reachable (clean 401 envelope from `/auth/refresh`), boot secrets present, CORS correctly returns `Access-Control-Allow-Origin: https://fabri-q-web.vercel.app`, and `/` redirects to `https://fabri-q-web.vercel.app` (WEB_APP_URL correct). Findings:
- **The deployed web build is stale** — `https://fabri-q-web.vercel.app` ships a bundle with **no API client at all** (no `api/v1` string, no `fabriq_auth` traces) and redirects `/` → `/login?from=%2F`, a route that no longer exists in the repo. → **Redeploy the web project from latest main.**
- **The deployed API build predates all 2026-09-16/17 fixes** — Swagger shows no flat `GET/POST /master-data/items`, no `GET /workflows/definitions` alias, and `/fabric-rolls` accepts only `page/pageSize/search/status` (no `filters`/`sortBy`). → **Redeploy the API project.**
- **`https://fabriq.vercel.app` is a different project** (an e-commerce clothing store, not FabriQ) — testing against it fails everything by definition.
- JWT/DATABASE_URL values cannot be read remotely; presence is proven by successful boot, strength is not verifiable.

Former hypotheses below (pre-verification):
5. ~~**CORS**~~ — verified OK for `fabri-q-web.vercel.app` on the live API; stays a risk only if the web domain changes without updating `WEB_ORIGIN`.
6. ~~**`NEXT_PUBLIC_API_URL`**~~ — cannot be confirmed from the stale bundle (no API URL embedded at all); must be set to `https://fabri-q-api.vercel.app/api/v1` **before** the web redeploy (inlined at build time).
7. ~~**Document upload**~~ — **Fixed 2026-09-17**: `FileService` now has a `cloudinary` driver (`STORAGE_DRIVER=cloudinary`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, optional `CLOUDINARY_FOLDER`). Set those on the API project and uploads persist; `local` remains the dev default. Files are stored as raw resources (byte-exact, checksums stay valid), and downloads stay auth-gated through `GET /documents/:id/download`.
8. **Rate limiting** — 120 req/min per IP (`ThrottlerModule`); bursts (dashboard + activity panels firing 4 parallel calls each + `pageSize=200` ref loads) can produce 429s.
9. **Neon cold starts** — first requests after idle can time out (the repo's own scripts retry 8× for this reason).
10. **Serverless duration limits vs 20s DB transactions** — lay/cut ledger transactions use `SELECT … FOR UPDATE` with `{ timeout: 20000 }`; on Vercel's default function timeout these can 504 under contention.
11. **Seed not run / env secrets** — missing `JWT_*` env vars crash the API at boot; unseeded live DB ⇒ logins fail.

### D. Data integrity notes
- Ledger writers are correctly serialized (row locks) — no known drift path; double-cut of a lay decided by exactly one winner.
- `buildListArgs` (generic admin lists) now **validates `sortBy` against a schema-derived whitelist** (fixed 2026-09-17): the allowed columns are the Prisma model's scalar/enum fields (via the DMMF at runtime), so an unknown or relation column returns a 400 (`Cannot sort by "…"`) instead of a Prisma validation 500. The generic `CrudService.list` passes its model automatically; every direct `buildListArgs` caller (audit, notifications, master-data, stock, workflows, the five procurement services) declares its model too. `sortOrder` was already DTO-validated (`asc|desc`). A services-defined explicit `sortByWhitelist` option is available when a narrower list is wanted; callers without a model/whitelist keep the old silent-fallback behavior so nothing regresses.

---

## 11. Verification Log (what was actually tested)

**Unit tests** — `packages/shared/test/*` (dependency-free ts-node runner, `pnpm --filter @fabriq/shared test`): **60 checks, all passing.**
- `inspection.test.ts` — 4-Point scoring: 1/2/3/4-point size bands, hole = 4 max, multi-defect sums, different widths (normalization is per **area**), different lengths, boundary values (≤15 / ≤30 thresholds, 15.0001 → SECOND).
- `marker.test.ts` — zero pieces, one piece, multiple pieces, rotated pieces, overlapping pieces, outside-width pieces, outside-marker pieces, end allowance, different widths/lengths; efficiency = patternArea/markerArea×100 (cap 100).
- `ledger.test.ts` — the spec scenario (100 m → reserve 5 → consume 5 → waste 0.5 → remaining 94.5 → reserve 10 more → available = remaining − reserved); append-only ledger; segment partition incl. defect carve-outs; reservation crossing a defect rejected; ADJUSTMENT rows included (a real bug found & fixed here — `summarizeRoll` previously ignored them and drifted from the stored balance).
- `production.test.ts` — lay output = garmentsPerMarker × ply; fabric per lay = marker length (NOT × ply); lays required = ceil(required/output); fulfillment actuals **derived** from cut sets via marker mix (planned values never copied); short/excess math; cancelled lays excluded.
- `cutting.test.ts` — pre-existing suite, still passing.

**E2E (local build, local API) — `scripts/cutting-e2e.mjs`: 43/43** (unchanged core chain: tenant isolation, RBAC, roll → measure → defect → marker → finalize → cut order → lay reserve → complete-cutting → ledger; concurrency via `scripts/ledger-concurrency.mjs`).

**E2E (local build, local API) — `scripts/v1-gaps-e2e.mjs`: 50/50** (new V1 surface): fabric master (create, unit→cm conversion, roll linkage) · pattern set v1 → revision v2 (new row, supersedes, pieces copied, v1 untouched) → apply-to-marker → finalize · lay plan (10 ply) → cutting → close-roll → remnant (number RM-…, full leftover, identity inherited, roll CLOSED at 0, REMNANT ledger row + segment) · guard rails (empty roll rejected, active lays block) · remnant inventory (list, include, status filter, patch) · **remnant as fabric source** (lay on the piece at its front, PLANNED hold, one-active-lay rule, partial cut shrinks the piece + span advances, leftover AVAILABLE again, parent ledger untouched — no double-count, `/lay-plans?remnantId=` filter, cancel releases) · lay-plans index (search + sort) · cross-tenant 403/404 + role-without-permission 403.

**Fixes made while verifying:** `FabricsService.create` leaked `defaultWidth` into Prisma (500 on create); `PatternSet` nested `pieces.create` violated the scoped-client tenant guard (pieces now created explicitly with tenantId); close-roll drift when recorded waste fell outside consumed spans (ledger is now authoritative); `closeRoll` duplicate variable declaration (compile error); e2e script misread the `{success, data: [...], meta}` envelope; `summarizeRoll` ignored RELEASED rows so available stayed understated after a lay cancel (now nets reservations against releases); segment partition gave REMNANT cells priority over lay cells, hiding lays planned inside a remnant span (lay > remnant > defect priority).

**Live smoke (2026-09-17, read-only HTTP against the current deployment):**
- ✅ `GET /api/v1/health` → 200 ok; ✅ login (`owner@acme.test`) issues a token; ✅ `/fabric-rolls`, `/markers`, `/lay-plans` lists respond 200 (DB connectivity proven).
- ❌ `/fabrics`, `/pattern-sets`, `/remnants` → 404: **the deployed API predates all 2026-09-17 work.** The full new chain is verified locally only. → **Redeploy the API from latest main, run the seed (syncs the new `fabric:*`/`pattern:*`/`remnant:*` permissions to existing tenants' roles), then re-run the smoke.**
- The web project must be redeployed with `NEXT_PUBLIC_API_URL=https://fabri-q-api.vercel.app/api/v1` set before build (name confirmed from `apps/web/src/lib/api.ts`). Cloudinary (`STORAGE_DRIVER=cloudinary` + 3 credentials) is verified in code with boot-time fail-fast; live values cannot be read remotely.

**Live smoke (2026-09-18, production-readiness audit, read-only):**
- ✅ `GET /api/v1/health` → 200; ✅ login → access token → `/auth/me` 200 → refresh endpoint returns a new access token (refresh/rotation verified live against the deployed build).
- ❌ `/fabrics`, `/pattern-sets`, `/remnants`, `/master-data/items`, `/workflows/definitions` all → 404: **the deployment still predates the 2026-09-16 admin/list fixes and all 2026-09-17 work.** Local `main` == `origin/main` (commit `0819ee1`), so this is purely a **Vercel redeploy**, not a code change.
- `/fabric-rolls?sortBy=zzz` → 200 on the stale build (old silent fallback); expect 400 after redeploy.

**Status legend:** ✅ implemented + verified (unit/e2e) · 🟡 implemented, not fully verified · ❌ missing. Nothing above is marked ✅ on the strength of code alone.

---

## 12. Recommended Next Steps

**P0 — Critical**
1. ✅ ~~Fix the two broken admin CRUDs + permissions page~~ — **Done**: flat `/master-data/items` endpoints, `/workflows/definitions` list alias, dedicated permissions catalog page. **Redeploy both apps to apply.**
2. ✅ ~~Verify live env~~ — **Verified 2026-09-17**: CORS + `WEB_APP_URL` are correct on the live API; boot secrets present; DB reachable. Remaining action: **redeploy both apps** (see §10-C) with `NEXT_PUBLIC_API_URL=https://fabri-q-api.vercel.app/api/v1` set on the web project *before* the build.
3. ✅ ~~Move document storage off local disk~~ — **Done**: Cloudinary driver added (`STORAGE_DRIVER=cloudinary` + `CLOUDINARY_*` vars; boot-time validation). **Set the Cloudinary env vars on the API project and redeploy to apply.**
4. ✅ ~~Fix cutting-list status filter + sorting~~ — **Done**: `filters` JSON parsed (whitelisted) + `sortBy`/`sortOrder` (whitelisted) on `/fabric-rolls`, `/markers`, `/cut-orders`; sortable headers in `ProcurementListPage`. **Redeploy both apps to apply.**

**P1 — Important**
5. Raise/verify function duration for ledger endpoints or shorten transaction scope; add retry guidance for Neon cold starts.
6. ✅ ~~Auto-create FabricRolls from approved GRN rolls~~ — **Done**: `WarehouseReceiptsService.create()` now calls `FabricRollsService.createFromGrnRoll()` inside the receipt transaction. **Redeploy the API to apply.**
7. ✅ ~~Add `/cutting/lay-plans` index page~~ — **Done** (list page with search/status/sort/pagination on the shared component).
8. Review throttling limits for real usage bursts.

**P2 — Improvement**
9. ✅ ~~Pattern-set management~~ — **Done**: `/pattern-sets` CRUD + versioned revisions + apply-to-marker + UI pages.
10. ✅ ~~Remnant workflow~~ — **Done**: close-roll → remnant, REMNANT ledger/segments, inventory page. Remnant-sourced lays/cuts (piece consumption) added 2026-09-17.
11. ✅ ~~Whitelist `sortBy` fields in `buildListArgs`~~ — **Done** (schema-derived per-model whitelist, 400 instead of 500 — see §10-D). ✅ Plan-calculator linked from the cut-order detail header (2026-09-18). ~~Auto-start approval workflows on submit~~ — **already implemented**: PR submit calls `WorkflowsService.startInstance` with lazy status sync (`requisitions.service.ts`).

---

## 13. V1 Acceptance (§22 of the spec) — question-by-question

| Factory question | Answered by | Status |
|---|---|---|
| How much fabric came in? | GRN rolls + `FabricRoll.originalLengthCm` (auto-created on warehouse receipt) | ✅ |
| Actual + usable width? | `widthCm` / `usableWidthCm` from multi-point measurement | ✅ |
| Where are the defects? | `FabricDefect` spans + timeline + marker CROSSES_DEFECT check | ✅ |
| Which marker is in use? | `LayPlan.markerId` → marker detail (+ pattern-set reference + revisions) | ✅ |
| Garments per marker? | `garmentsPerMarker` (Σ size ratio), server-recomputed | ✅ |
| How many plies planned? | `LayPlan.ply` | ✅ |
| How much reserved? | RESERVED segments + ledger RESERVED rows | ✅ |
| Actually consumed? | CONSUMED ledger + `CutOperation.actualLengthCm` | ✅ |
| Pieces actually cut? | `CutOperation` (actual/rejected pieces) + size-wise fulfillment actuals | ✅ |
| How much wasted? | WASTE ledger + per-cut `wasteLengthCm` | ✅ |
| How much remains? | `summarizeRoll` (ledger-authoritative, ADJUSTMENT-aware) | ✅ |
| Did the remainder become a remnant? | `close-roll` → `Remnant` + REMNANT ledger row + REMNANT segment | ✅ |
| Was the remnant itself cut, and what is left of it? | Remnant-sourced lays + shrinking piece (`lengthCm`/source span), status AVAILABLE→PLANNED→AVAILABLE/CONSUMED | ✅ |
| Traceability to the original roll? | Append-only `RollTransaction` (+ remnant `sourceRollId` + source span) | ✅ |

All verified by the unit + e2e suites listed in §11; **live verification of the new chain still requires the redeploy + seed documented there.**
