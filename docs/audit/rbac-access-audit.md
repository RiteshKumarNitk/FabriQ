# Role-Based Access Control Audit — FabriQ Platform Foundation

**Date:** 2026-08-07
**Scope:** Platform Foundation + Phase 2 Procurement. No new business modules were implemented.
**Method:** Live login as every seeded role → UI walkthrough in the running app (web :3000, API :3001) → direct API probing of every read + write endpoint per role → cross-tenant isolation tests → console/network log review.

---

## 1. Roles audited

| Role | Credentials | Notes |
|---|---|---|
| Platform Admin | `admin@fabriq.local` / `Admin@123` | No tenant; `isPlatformAdmin` bypasses RBAC |
| Tenant Admin | `owner@acme.test` / `Demo@123` | TENANT_ADMIN — full tenant permissions |
| Factory Manager | `manager@acme.test` / `Demo@123` | FACTORY_MANAGER |
| Supervisor | `supervisor@acme.test` / `Demo@123` | SUPERVISOR |
| Operator | `operator@acme.test` / `Demo@123` | OPERATOR — read-only |
| Viewer | `viewer@acme.test` / `Demo@123` | VIEWER — **was not seeded**; created during this audit via the app's own Users API |

---

## 2. Access matrix (verified live, endpoint-by-endpoint)

Legend: `200` accessible · `403` blocked by RBAC · `400` guard passed but validation rejected · `401` unauthenticated · `[]` empty (fail-closed)

### Reads

| Endpoint | Tenant Admin | Factory Mgr | Supervisor | Operator | Viewer | Platform Admin |
|---|---|---|---|---|---|---|
| /dashboard/summary | 200 | 200 | 200 | 200 | 200 | 400* |
| /companies | 200 | 200 | 200 | 403 | 403 | 200 [] |
| /factories | 200 | 200 | 200 | 200 | 200 | 200 [] |
| /warehouses | 200 | 200 | 200 | 200 | 200 | 200 [] |
| /org-units/departments | 200 | 200 | 200 | 200 | 200 | 200 [] |
| /users | 200 | 200 | 200 | 403 | 403 | 200 [] |
| /roles | 200 | 200 | 403 | 403 | 403 | 200 [] |
| /permissions | 200 | 200 | 403 | 403 | 403 | 200 |
| /settings | 200 | 200 | 403 | 403 | 403 | 200 [] |
| /master-data/categories | 200 | 200 | 200 | 200 | 200 | 200 [] |
| /audit | 200 | 200 | 403 | 403 | 403 | 200 [] |
| /notifications | 200 | 200 | 200 | 200 | 200 | 200 [] |
| /workflows/tasks | 200 | 200 | 200 | 200 | 200 | 200 [] |
| /tenants | **403** | 403 | 403 | 403 | 403 | 200 |
| /suppliers … /purchase-orders /goods-receipts /inspections /warehouse-receipts /stock | 200 | 200 | 200 | 200 | 200 | 200 [] |

\* `/dashboard/summary` intentionally returns 400 for the platform admin (no tenant context) — the platform admin has no tenant dashboard yet.

### Writes (empty-body probe — `400` = guard passed, `403` = denied)

| Endpoint | Tenant Admin | Factory Mgr | Supervisor | Operator | Viewer | Platform Admin |
|---|---|---|---|---|---|---|
| POST /tenants | **403** | 403 | 403 | 403 | 403 | 400 |
| POST /companies | 400 | 403 | 403 | 403 | 403 | 400 |
| POST /users | 400 | 403 | 403 | 403 | 403 | 400 |
| POST /roles | 400 | 403 | 403 | 403 | 403 | 400 |
| PUT /settings | 400 | 403 | 403 | 403 | 403 | 400 |
| POST /suppliers | 400 | 400 | 403 | 403 | 403 | 400 |
| POST /requisitions | 400 | 400 | 400 | 403 | 403 | 400 |
| POST /purchase-orders | 400 | 400 | 403 | 403 | 403 | 400 |
| POST /goods-receipts | 400 | 400 | 400 | 403 | 403 | 400 |
| POST /inspections | 400 | 400 | 400 | 403 | 403 | 400 |
| POST /warehouse-receipts | 400 | 400 | 403 | 403 | 403 | 400 |
| POST /workflows/instances | 400 | 400 | 400 | 403 | 403 | 400 |
| POST /workflows/tasks/:id/action | 400 | 400 | 400 | 403 | 403 | 400 |
| POST /documents/upload | 400 | 400 | 400 | 403 | 403 | 400 |

No-token request → 401 everywhere. **Backend RBAC is enforced correctly on every endpoint.**

---

## 3. Per-role observations

### Platform Admin
1. **Accessible:** Tenants (full CRUD + stats), permissions catalog, everything (platform bypass).
2. **Hidden:** nothing (bypass); tenant admin pages now return empty lists by design (fail-closed).
3. **Dashboard:** broken — lands on the tenant dashboard and shows an error card "Dashboard requires a tenant context". No platform dashboard (tenant health, subscription, platform activity) exists.
4. **Actions:** all available.
5. **Missing functionality:** tenant creation works (see bug #4 fixed); platform admin **cannot update/archive** tenant users it created (scoped-client mutation throws; create works but the response body is `null` because the follow-up `getById` fails closed).
6. **UI/UX:** platform admin should land on a platform overview, not the tenant dashboard.

### Tenant Admin
1. **Accessible:** everything in the tenant.
2. **Hidden:** Platform/Tenants module (correct after fix).
3. **Dashboard:** full KPI grid + procurement row + audit trail + notifications.
4. **Actions:** full CRUD, approvals, workflow, documents, comments.
5. **Data visibility:** whole tenant; correct.
6. **Missing:** no per-role dashboards; no drill-through from KPIs to filtered lists.
7. **UX:** the sidebar shows everything (fine for admin); recent-activity panel is useful; could add approval tasks shortcut.

### Factory Manager
1. **Accessible:** dashboard, companies/factories/warehouses (read), org units (read+create+update), users (read only), roles/permissions (read), settings (read only), master data (read+write), audit, documents, workflows (read+approve), full procurement (read/write/approve).
2. **Hidden:** tenant management, platform, user/role/setting writes.
3. **Dashboard:** same generic grid as everyone.
4. **Actions:** procurement approvals via My Tasks + Submit/Approve on docs.
5. **Data visibility:** whole tenant (manager sees all warehouses/lines) — no factory-level scoping even though `factoryId` is on the profile. **Finding:** `factoryId` in the token is never used to scope data — a multi-factory tenant's manager sees every factory.
6. **UX:** Settings page renders editable inputs but Save → 403 (no `setting:update`); confusing — inputs should be read-only or the page hidden.

### Supervisor
1. **Accessible:** dashboard, companies/factories/warehouses (read), org units (read), users (read), master data (read), documents (read+create), notifications, workflows (read+approve), procurement reads + requisition create/update + GRN create/update + inspection create/update.
2. **Hidden:** roles/permissions/settings/audit, supplier/PO/WR writes.
3. **Dashboard:** generic grid; shows Companies/Users KPI cards it cannot open (403).
4. **Actions:** PR submit/approve/convert correctly gated; **PO detail shows Print/Edit/Cancel buttons that all 403** (only `purchaseorder:read`); GRN/Inspection new-buttons correctly gated by list page, but the edit form pages themselves are not gated (save fails with 403).
5. **UX:** Audit Log link in sidebar → page silently shows "No audit events found" for users without `audit:read` (403 swallowed) — misleading; the authorized-user crash behind that same page was fixed (see B5).

### Operator
1. **Accessible:** dashboard, factories/warehouses/org-units/master-data (read), notifications, workflow reads, all procurement reads, stock.
2. **Hidden:** companies, users, roles, permissions, settings, audit, tenant.
3. **Dashboard:** generic grid leaks **all** tenant KPIs (Companies, Users counts) and the tenant-wide Recent Activity (other users' logins, user-creation events) — the operator should not see user counts or the full audit trail on their home page.
4. **Actions:** none beyond read + comments (own) + notifications. Correctly enforced at API level.
5. **UX:** sidebar shows Companies/Users/Roles/Permissions/Settings/Audit links that all 403 on click; direct URL `/admin/users` renders the page shell + two error toasts + empty table instead of an access-denied screen.

### Viewer
1. **Accessible:** dashboard, factories/warehouses/org-units/master-data (read), notifications, workflows (read), all procurement reads, stock.
2. **Hidden:** companies (viewer matrix lacks company:read), users, roles, permissions, settings, audit, tenant, everything write.
3. **Dashboard:** same generic grid + audit-trail leak as Operator.
4. **Actions:** none.
5. **Missing role user:** no `viewer@acme.test` was seeded — created during this audit (keep for demos or remove).

---

## 4. Permission & security issues found

| # | Severity | Issue | Status |
|---|---|---|---|
| S1 | **Critical** | **Tenant admins were granted `platform:manage`** (TENANT_ADMIN = every permission incl. platform-level). `owner@acme.test` could list, create, and archive tenants (GET/POST /tenants = 200). | **FIXED** — excluded from matrix; two-way role sync added; verified 403 |
| S2 | **High** | **Users in a SUSPENDED tenant can still log in** — login validates only user status, never tenant status. Verified: suspended BETA tenant's user still received a token. | **OPEN** — needs product decision |
| S3 | **Medium** | **Comments module gated by `notification:read`** (semantically wrong permission); `comment:manage` is referenced in the service but **does not exist** in the permission catalog. Ownership check protects deletion today, but the permission model is wrong. | OPEN |
| S4 | **Low** | Factory/company scoping in token is unused — `factoryId`/`companyId` never restrict data; multi-factory tenants would need it later. | OPEN (design note) |
| S5 | **Low** | Platform admin user-create returns `data: null` (follow-up `getById` fails closed); platform admin cannot update/archive tenant users (scoped mutation throws). | OPEN (functional gap) |

### Verified secure
- Every API handler carries `@Permissions(...)`; no handler is auth-only except auth/health.
- All 403/401 paths return before any data processing; no data leaks on denied reads.
- Cross-tenant isolation holds: ACME owner → /tenants 403; a BETA account → 403 on ACME's supplier by direct ID; scoping is structural (tenantId injected by the Prisma extension into every read/write).
- `passwordHash` never leaves the API (verified 0 occurrences in /users payloads).

---

## 5. Runtime errors found & fixed (all verified live)

| # | Error | Root cause | Fix |
|---|---|---|---|
| B1 | `GET /users` → 500 for every authorized role | CrudService built a `select: { passwordHash: false }` — Prisma rejects an all-false select ("needs at least one truthy value") | Build full scalar select via `Prisma.<Model>ScalarFieldEnum`; harden to throw (never silently leak) instead of degrading |
| B2 | Platform admin `GET /companies|users|suppliers|…` → 500 | Tenant-scoped `$extends` client injected `tenantId: null` into non-nullable columns → Prisma validation error | Fail-closed: no-tenant reads return empty, mutations throw a clear message |
| B3 | `POST /tenants` (platform) → 500 | Tenant provisioning (~350 role-permission upserts) exceeded Prisma's **5s interactive transaction timeout** on Neon | Transaction timeout raised to 60s |
| B4 | Tenant admin could manage the platform | see S1 | Matrix + two-way sync |
| B5 | `/tasks`, `/notifications`, `/audit` pages crashed / silently showed empty | All list endpoints return `data` as a **bare array** (meta on the envelope), but these pages used `http.get<{ items }>` → `res.items` was `undefined` → `items.length` threw (live crash on /tasks) | Pages now use the existing `list()` helper (unwraps bare-array data + envelope meta) |

No console errors in the browser beyond the expected 401/403/400 from the audited flows.

---

## 6. Dashboard redesign recommendations (by role)

| Role | What the dashboard should show | 
|---|---|
| **Platform Admin** | Tenant health: tenant count, active/suspended/onboarding, storage/quota, platform audit, recent tenant signups, subscription revenue snapshot. Landing page should differ from the tenant dashboard. |
| **Tenant Admin** | Keep the full overview + add: pending approvals, low-stock alerts, document-expiry reminders, drill-through KPI → filtered list links. |
| **Factory Manager** | Factory overview (production KPIs once Production lands), pending approvals ("My Tasks" first-class), open POs, GRN backlog, warehouse levels, line status. Hide user-management KPIs. |
| **Supervisor** | Requisition approval queue, GRN/inspection pending counts, today's receipts, master-data quick links. |
| **Warehouse Manager** (future role) | Stock balances, low-stock alerts, GRNs to receive, pending inspections, warehouse transfers. |
| **Purchase Manager** (future role) | Open requisitions to convert, POs by status, supplier performance, pending approvals. |
| **Quality Manager** (future role) | Rolls awaiting inspection, defect-rate trends, rejected/second-quality summaries. |
| **Store Keeper** (future role) | GRN create, stock issue/transfer actions, barcode/QR ops. |
| **Operator** | Assigned tasks only, own shift info, simplified read-only view — no admin KPIs, no user counts, no audit trail. |
| **Viewer** | Same as Operator minus task actions; strict read-only. |

**Cross-cutting dashboard fixes (High):**
1. KPI cards must render only for modules the role can read (use `has()`), so links never 403.
2. Recent Activity panel should respect `audit:read`; for roles without it, replace with notifications or hide.
3. Add a role-aware welcome/title ("Good morning, Priya — 3 approvals waiting").

---

## 7. Navigation improvements (frontend RBAC)

1. **Sidebar must filter by permission** (`SIDEBAR_GROUPS` items need a `permission` field; filter with `has()`). Today every tenant role sees Companies, Users, Roles, Permissions, Settings, Audit regardless of permission.
2. **Route-level authorization**: the `(app)` layout only checks authentication. Add a permission-aware guard/page wrapper so unauthorized URLs redirect to the dashboard (or render a clean 403 screen) instead of a page shell + error toasts. Applies to `/admin/[entity]`, `/admin/[entity]/[id]`, `/settings`, `/audit`, and the procurement create/edit pages.
3. **Action buttons must be permission-gated**: PO detail Print/Edit/Cancel and PR detail Edit/Cancel render without the required permission. Gate with `has('purchaseorder:update'|'purchaseorder:approve'|'requisition:update')` etc.
4. **Hide misleading surfaces**: Settings (read-only roles), Audit (no `audit:read`), Permissions (read-only) should hide or degrade to read-only, not show dead Save buttons or "no events" empty states.
5. **Platform admin landing**: route platform admins to a platform home, not the tenant dashboard.

---

## 8. Prioritized fix list

### Critical
- ~~Tenant admin `platform:manage` escalation~~ — **DONE** (verified 403).

### High
- H1. Enforce tenant status at login (suspended/closed tenants must not authenticate).
- H2. Sidebar permission filtering + route-level authorization guard (403 screens).
- H3. Gate PO/PR detail action buttons by permission.

### Medium
- M1. Role-aware dashboard: KPI cards + Recent Activity filtered by permission; platform admin landing page.
- M2. Fix comments permission model (`comment:manage` catalog entry; gate create/delete on document-scoped permissions).
- M3. Settings page: read-only rendering for roles without `setting:update`; audit page: real "access denied" state.

### Low
- L1. Platform admin: user create should return the created record; add update/archive path for platform-created users.
- L2. Factory/company-level data scoping for future multi-factory roles.
- L3. Seed a `viewer@acme.test` demo user (or remove VIEWER from the matrix if unused).
- L4. Batch the tenant-provisioning role-permission upserts (`createMany` + `skipDuplicates`) to cut transaction time.

---

## 9. Test artifacts
- `viewer@acme.test / Demo@123` (VIEWER) — created via API; keep or delete.
- `user@beta.test / Beta@123` — created in a temporary BETA tenant used for isolation testing; BETA tenant is **archived** (soft-deleted); the account is inert. Recommend deleting the user row if no longer needed.
