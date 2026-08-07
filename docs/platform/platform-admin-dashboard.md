# Platform Admin Dashboard & Role-Based Flow — Deliverables

**Date:** 2026-08-07
**Companion:** `docs/audit/rbac-access-audit.md` (endpoint-level RBAC matrix, security findings)

This document covers the new Platform Administration experience, role-aware dashboards, navigation structure, and the consolidated validation/UX review.

---

## 1. Platform Admin Dashboard (implemented)

Landing page for `admin@fabriq.local` — served at `/dashboard` when the session is a platform admin (tenant roles keep their own dashboard).

**Backend:** `GET /api/v1/platform/summary` — `@Permissions('platform:manage')` at controller level; aggregates across ALL tenants via the raw client (never the tenant-scoped client). Verified: 200 for platform admin, **403 for every tenant role**.

| Widget group | Contents | Data |
|---|---|---|
| Platform Overview | Total / Active / Suspended / Trial tenants; Companies; Factories; Warehouses; Users; Active Sessions; Audit Events | Live |
| Subscriptions | Active plans (by plan), trial count, expiring, licenses used/total, revenue, storage | Plans/licenses live; revenue/storage/expiring = placeholders (`null` → "Not available") |
| System Health | API, Database, Queue, File Storage, Version, Uptime, Last Backup | API/DB/version/uptime live (DB ping = `SELECT 1`); queue/storage/backup = not-configured |
| Platform Activity | Recent cross-tenant audit events, logins today, failed logins, total audit events | Live (failed logins = 0 placeholder — login failures aren't audited yet) |
| Quick Actions | Create Tenant, View Tenants, Audit Logs, Subscription Plans, Platform Settings | Links |
| Charts | Tenant / User / Company growth (6 months), Daily logins (7 days) | Live, hand-rolled dependency-free bar charts |

Health pills: green OK / amber degraded / muted not-configured. Placeholders are visually marked so they read as "pending module" rather than real zeros.

## 2. Role-based dashboards (implemented)

Dashboard now branches: **platform admins → PlatformDashboard**, everyone else → permission-aware tenant dashboard:

- **Platform Admin** — full SaaS overview (above).
- **Tenant Admin / Company Admin** — all tenant KPIs + audit trail + notifications + approvals shortcut; greeting "Company Administrator view".
- **Factory Manager / Supervisor** — same filtered grid they can actually open; approvals shortcut; greeting reflects role.
- **Operator / Viewer** — only KPIs for readable modules (Factories, Warehouses, Production Lines, Master Data, Procurement); **Recent Activity (audit) panel removed**; simplified "Operator view".

**Future-role dashboard map** (when roles land): Warehouse Manager → stock/low-stock/GRN; Purchase Manager → PR/PO/approvals/supplier performance; Production/Quality Manager → production KPIs, inspections, defects; Store Keeper → GRN/issue/transfer/barcode actions; Operator → task-focused only. Each maps to the same KPI-card architecture (add cards + permissions, no new plumbing).

## 3. Navigation structure (implemented)

Sidebar is now **permission-aware** — items render only when the user holds the module's read permission (platform items only for platform admins). Verified live per role.

```
OVERVIEW        Dashboard
PLATFORM*       Tenants · Subscription Plans · Licenses · Platform Settings · System Configuration
ORGANIZATION    Companies · Factories · Warehouses · Departments · Sections · Production Lines
IDENTITY & ACCESS  Users · Roles · Permissions
CONFIGURATION   Master Data · Master Data Items · Workflow Definitions
PROCUREMENT     Suppliers · Requisitions · Purchase Orders · Goods Receipts · Inspections · Warehouse Receipts · Stock
OPERATIONS      My Tasks · Notifications · Audit Log · Settings
```
\* Platform items gated by `isPlatformAdmin`; placeholder pages (`/platform/[section]`) exist for Subscription Plans / Licenses / Platform Settings / System Configuration, each marked "In development" and route-gated (tenant roles are redirected to `/dashboard` — verified).

## 4. Role permission matrix

| Capability | Platform Admin | Tenant Admin | Factory Mgr | Supervisor | Operator | Viewer |
|---|---|---|---|---|---|---|
| Platform (/platform, /tenants) | ✅ | ❌ 403 | ❌ | ❌ | ❌ | ❌ |
| Dashboard | Platform | Tenant | Tenant | Tenant | Tenant | Tenant |
| Organization (companies/factories/warehouses/org) | read-all | full | read (+warehouse/org write) | read | read (no companies) | read (no companies) |
| Identity (users/roles/permissions) | read-all | full | read-only | users read | ❌ | ❌ |
| Settings | read | full | read | ❌ | ❌ | ❌ |
| Audit | read-all | read | read | ❌ | ❌ | ❌ |
| Master data | read-all | full | read+write | read | read | read |
| Workflows | read+approve | full | read+approve | read+approve | read | read |
| Procurement | read | full | full | create/update (no supplier/PO/WR write) | read | read |
| Documents / Notifications | full | full | read+create | read+create | read | read |
| Sidebar visibility | all | all tenant | tenant (minus write-only gaps) | tenant (minus admin) | read-only set | read-only set |

Verified endpoint-level in `docs/audit/rbac-access-audit.md` §2.

## 5. Platform flow validation report

- Platform admin login → dashboard (platform view) → Tenants CRUD → tenant creation (provisioning works, 60s tx) → platform summary. All flows pass.
- Tenant admin login → dashboard → users/roles/settings/audit → procurement chain. Pass.
- Supervisor/Operator/Viewer: read-model verified; all writes 403.
- Cross-tenant isolation re-verified (ACME ↔ BETA) — sealed.
- Suspended-tenant login **still not enforced** (High, open).

## 6. Security review

- `/platform/summary` fully gated (`platform:manage`); no tenant role can reach it (403).
- `/platform/[section]` routes redirect non-platform users.
- Sidebar hides modules without read permission (visibility now matches access).
- All prior audit fixes hold: `/users` 200, tenant admin `/tenants` 403, fail-closed platform reads, passwordHash never exposed.
- **Open:** suspended/closed tenant users can still authenticate (login checks user status only).

## 7. UI/UX review highlights

Improved this pass: permission-aware sidebar; role-aware dashboard (greeting, filtered KPIs, hidden audit panel for non-auditors); platform dashboard with health pills, quick actions, charts; consistent card grid; "In development" placeholder pattern for future modules.

Consistent across the app: card-based lists, tables with pagination, dialogs with confirmations, toast feedback, skeletons, empty states, responsive `grid-cols-2/3/xl` behavior.

## 8. Bugs & inconsistencies (current)

| ID | Issue | Severity |
|---|---|---|
| 1 | **Custom tenant roles could be granted `platform:manage` → non-platform user reached /platform/summary + /tenants (exploit reproduced). FIXED**: RbacGuard now requires platform-admin status for any `platform:*` permission, and RolesService rejects platform permissions for non-platform admins. Verified 403 on both endpoints + 400 on role creation. | Critical (fixed) |
| 1b | Suspended/closed tenants can still log in | High |
| 2 | PO/PR detail action buttons (Print/Edit/Cancel) visible without permission | High |
| 3 | Comments gated by `notification:read`; `comment:manage` missing from catalog | Medium |
| 4 | Settings page shows editable inputs to read-only roles (Save 403s) | Medium |
| 5 | Audit page shows "No audit events" to roles without `audit:read` (403 swallowed) | Low |
| 6 | Failed logins not audited → platform "Failed logins" widget is a placeholder | Low |
| 7 | `factoryId`/`companyId` in JWT unused for data scoping (multi-factory future) | Low |
| 8 | Platform admin can't update/archive tenant users; create returns `null` body | Low |

## 9. Prioritized improvement list

**Critical** — none open (tenant-admin platform escalation fixed previously).

**High**
1. Enforce tenant status at login (block SUSPENDED/CLOSED/archived).
2. Gate PO/PR detail action buttons by permission (hide Print/Edit/Cancel where not permitted).
3. Add route-level authorization guard for admin entity routes (403 screen instead of shell + toasts).

**Medium**
4. Comments permission model fix (`comment:manage`).
5. Settings page read-only mode for read-only roles.
6. Record failed logins (audit action) and surface in platform dashboard.

**Low**
7. Factory/company-level data scoping.
8. Platform-admin user management (update/archive path, non-null create response).
9. Batch tenant-provisioning upserts (`createMany` + `skipDuplicates`) to reduce tx time.
10. Seed `viewer@acme.test`; clean up inert `user@beta.test` test account.
