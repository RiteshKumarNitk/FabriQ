# Phase 1 — Platform Foundation: Module Documentation

Each module below documents: Business Flow · Technical Design · Validation & Business Rules ·
Permissions · Acceptance Criteria. UI behavior is shared (see the config-driven entity system in
`apps/web/src/lib/entities.ts`) and noted once.

## Shared UI behavior (all modules)

- **List page**: search box, per-module filter dropdowns, sortable columns, pagination
  (10/20/50/100), CSV export, refresh, row actions (View / Edit / Archive).
- **Create/Edit**: modal form generated from the entity config — zod schema, inline validation,
  dynamic reference selects (companies, factories, departments, roles, categories), multi-select
  permission/role checkboxes.
- **Detail page**: field overview, status badges, tabs for Activity (audit), Comments,
  Documents (upload/download), Workflows (start instance + progress).
- **RBAC gating**: actions render only when the signed-in user holds the required permission.

## 1. Authentication & Session

- **Business flow**: email/password → access token (15 min) + rotating refresh token (7 days,
  hashed at rest, rotated on use) → session restored from `/auth/me`; logout revokes the token.
- **Design**: `AuthModule` (NestJS + `@nestjs/jwt`, bcrypt cost 12, SHA-256 refresh storage,
  per-device metadata). Global `JwtAuthGuard` + `RbacGuard`.
- **Rules**: inactive/locked accounts cannot sign in; passwords ≥ 8 chars; throttled at 120
  req/min per IP.
- **Permissions**: none (public endpoints).
- **Acceptance**: login returns a token pair; refresh rotates; me resolves the full profile;
  invalid/expired tokens → 401.

## 2. Tenants (platform)

- **Business flow**: platform admin creates a tenant → system roles (TENANT_ADMIN … VIEWER) and
  default settings are provisioned transactionally → tenant admin logs in and onboards org data.
- **Design**: `TenantsModule` (raw client, transactional provisioning via
  `packages/database/src/tenant-provision.ts`); `/tenants/:id/stats` exposes tenant usage.
- **Rules**: unique code `^[A-Z0-9_-]+$`; status transitions managed by admin.
- **Permissions**: `platform:manage`.
- **Acceptance**: creating a tenant provisions roles + settings in one transaction; archived
  tenants disappear from lists; stats return correct counts.

## 3. Company / Factory / Warehouse

- **Business flow**: tenant admin defines legal entities (companies) → factories per company →
  warehouses by type (raw material / WIP / finished goods / returns).
- **Design**: three CRUD modules extending `CrudService` (tenant-scoped delegate, soft-delete,
  version bumps). Cross-tenant reference validation (`companyId` must exist in the tenant).
- **Rules**: unique `code` per tenant; warehouse type enum; factory must reference an in-tenant
  company.
- **Permissions**: `company:read/create/update/delete`, `factory:*`, `warehouse:*`.
- **Acceptance**: CRUD flows; attempting another tenant's companyId → 400.

## 4. Organization structure (Department / Section / Production Line)

- **Business flow**: departments per factory → sections per department → production lines per
  factory (optional department); `GET /org-units/tree` renders the whole tree for production UI.
- **Design**: single `OrgUnitsModule` with three resource groups; tree endpoint nests
  factory → departments → sections + lines.
- **Rules**: unique codes scoped to their parent (`[tenantId, factoryId, code]` etc.).
- **Permissions**: `orgunit:*`.
- **Acceptance**: tree endpoint returns the nested structure; parent references validated.

## 5. Users & Roles & Permissions (identity)

- **Business flow**: tenant admin creates users with passwords, assigns roles; roles bundle
  permissions selected from the catalog; permission assignments are versioned.
- **Design**: `UsersModule` (bcrypt hashing, role assignment in transactions, reset-password),
  `RolesModule` (permission sync validates codes against the shared catalog),
  `PermissionsModule` (read-only grouped catalog).
- **Rules**: unique email (global); roles must belong to the user's tenant; unknown permission
  codes rejected; passwords cannot be changed via update payload (dedicated endpoint).
- **Permissions**: `user:*`, `role:*`, `permission:read`.
- **Acceptance**: role permission changes take effect on next login/refresh; users cannot be
  assigned roles from other tenants.

## 6. Settings & Master data (configuration)

- **Business flow**: per-tenant key–value settings (seeded defaults: timezone, currency, bundle
  size, inspection level, …); master data categories (fabric type, color, size, garment
  category) with items used by downstream modules' dropdowns.
- **Design**: `SettingsModule` (grouped upsert), `MasterDataModule` (categories + items +
  `options?category=` dropdown endpoint).
- **Rules**: setting keys dot-namespaced (`general.timezone`); item codes unique per category.
- **Permissions**: `setting:*`, `masterdata:*`.
- **Acceptance**: settings persist grouped; options endpoint returns active items ordered.

## 7. Audit log

- **Business flow**: every mutating request is recorded automatically with actor, tenant,
  sanitized payload and metadata; UI filters by module/action/entity.
- **Design**: global `AuditInterceptor`; immutable `AuditLog` rows; auth login events recorded
  by the auth service.
- **Rules**: passwords/tokens stripped from stored bodies; reads are tenant-filtered.
- **Permissions**: `audit:read`.
- **Acceptance**: create/update/archive appear in the log within the same request.

## 8. Workflow framework

- **Business flow**: admin configures a definition (entity type + ordered steps with role
  assignees) → starting an instance creates a task for the first step → assignees act
  (approve/reject with comment) → advance or reject → notifications at every transition.
- **Design**: `WorkflowsModule` — definitions (steps as nested array), instances (one in-flight
  per entity), tasks (role-based assignment, "my tasks" query), transition engine with
  notifications.
- **Rules**: one in-progress instance per entity; actions require step eligibility
  (`assigneeUserId` or membership of `assigneeRoleCode`); rejection ends the flow.
- **Permissions**: `workflow:read/create/delete/approve`.
- **Acceptance**: seeded PR-APPROVAL definition (Supervisor → Factory Manager) routes a
  document through two approvals; rejecting terminates the instance.

## 9. Notifications & Comments & Documents

- **Notifications**: per-user inbox, unread counts, mark-read / read-all; workflows publish
  TASK/APPROVAL notifications automatically.
- **Comments**: polymorphic discussion threads on any entity (`entityType/entityId`); authors or
  admins may delete.
- **Documents**: upload (50 MB cap, SHA-256 checksum) → local `FileService` (single seam; no
  provider abstraction — YAGNI) → metadata rows with tenant scoping; download streams with
  proper content-type; delete removes the object. Swapping in Cloudinary/S3 later touches only
  `FileService`.
- **Permissions**: `notification:read`, `document:*`.
- **Acceptance**: comment threads render on detail pages; uploads/downloads work end-to-end;
  cross-tenant document ids → 404.

## 10. Dashboard

- **Business flow**: tenant landing page with KPI counts, recent activity and recent
  notifications.
- **Design**: `DashboardModule` `/dashboard/summary` aggregates counts via parallel tenant-scoped
  queries.
- **Permissions**: `dashboard:read`.
- **Acceptance**: counts match the data for the signed-in tenant only.
