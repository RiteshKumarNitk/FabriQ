# Architecture

## 1. Principles

1. **Configurable over hardcoded** — no hardcoded business logic; master data, settings,
   workflows, roles and permissions are data-driven.
2. **Generic over customer-specific** — every feature is built for the general case. Customer
   variations are configurations, not code.
3. **Tenant isolation as a platform guarantee** — enforced at the data-access layer, not by
   convention.
4. **Everything is traceable** — every mutation is audited; every record carries audit columns,
   soft-delete state and an optimistic version.
5. **10-year maintainability** — a single source of truth for enums, permissions, and defaults;
   packages with narrow contracts; no duplicated code.

## 2. Monorepo

pnpm workspaces + Turborepo. Packages compile to `dist/` and are consumed through `exports` maps
(`types` → `.d.ts`, `default` → `.js`); apps never import package source. Turborepo orders builds
(`dependsOn: ["^build"]`), so `pnpm run build` compiles `shared` → `database` → apps.

| Package | Responsibility | Consumers |
|---|---|---|
| `@fabriq/shared` | Enums, permission catalog, constants, API response/list types | api, web, database |
| `@fabriq/database` | Prisma schema, Prisma client factory, tenant-scoped client extension, tenant provisioning, seed | api |

## 3. Clean Architecture layers

| Layer | Location | Rules |
|---|---|---|
| Presentation | `apps/api/src/**/controller.ts`, `apps/web/src/app/**` | DTO validation, RBAC decorators, HTTP mapping only |
| Application | `apps/api/src/**/service.ts` | Orchestrates use cases; no HTTP knowledge |
| Domain | `packages/shared/src/**`, `packages/database/prisma/schema.prisma` | Enums, permission catalog, data contracts, invariants (uniqueness, audit columns) |
| Infrastructure | `apps/api/src/prisma`, `.../common/file.service.ts`, `.../config` | Prisma client, local file storage, env config |

Business rules live in services (application layer) or domain constants — never in controllers or
UI components.

## 4. Request pipeline (API)

```
Request
  → ThrottlerGuard        (rate limit, 120 req/min)
  → JwtAuthGuard          (verify access token → attach RequestContext to request + AsyncLocalStorage)
  → RbacGuard             (enforce @Permissions(...) codes; platform admin bypasses)
  → ValidationPipe        (class-validator, whitelist, transform)
  → AuditInterceptor      (record mutating requests as AuditLog rows)
  → ResponseInterceptor   (wrap in { success, data, meta? } envelope)
  → handler (controller → service → tenant-scoped Prisma client)
  → HttpExceptionFilter   (map errors to { success: false, error: { code, message } })
```

## 5. Multi-tenant isolation

- `AsyncLocalStorage` (`packages/database/src/tenant-context.ts`) holds the per-request
  `RequestContext` (userId, tenantId, companyId, factoryId, roles, permissions).
- `createTenantScopedClient` (`packages/database/src/client.ts`) wraps every Prisma client with a
  `$allModels` query extension that:
  - injects `tenantId` into **every** `where` on read/update/delete for tenant-scoped models;
  - stamps `tenantId` onto **every** create/upsert;
  - **fails closed**: with no tenant context, scoped creates throw and scoped reads return nothing.
- Platform-level operations (tenants, permission catalog, cross-tenant provisioning, audit
  writes) use the raw client and set `tenantId` explicitly.

Models **not** tenant-scoped: `Tenant`, `Permission`, `RolePermission`, `UserRole` (no tenantId
column). Everything else is enforced automatically.

## 6. Authentication & authorization

- **Access token**: JWT, 15 min TTL, carries `sub, email, tenantId, companyId, factoryId, roles,
  permissions, isPlatformAdmin`.
- **Refresh token**: opaque JWT, 7-day TTL, **hashed (SHA-256) at rest**, rotated on every
  refresh (old token revoked, chained via `replacedByTokenId`), device meta captured.
- **Passwords**: bcrypt (cost 12).
- **RBAC**: permission codes from the catalog in `@fabriq/shared`; the `Permission` table is
  seeded/kept in sync from the same catalog; `RbacGuard` enforces `@Permissions(...)`; platform
  admins bypass checks.

## 7. Audit

`AuditInterceptor` records every POST/PUT/PATCH/DELETE to the immutable `AuditLog` table: action,
module, entityType/Id, method, path, sanitized request body (passwords/tokens stripped), status,
IP, user-agent, actor and tenant. Auth login events are recorded explicitly by the auth service.

## 8. Security

Helmet headers, CORS allow-list from env, rate limiting, input validation (class-validator),
parameterized queries (Prisma — no raw SQL), sanitized audit payloads, secret-hashed refresh
tokens, tenant fail-closed behavior, and RBAC on every endpoint.

## 9. Scalability notes

- Every list endpoint supports pagination, search, filters, sorting — page size capped at 200.
- Composite unique keys per tenant (`[tenantId, code]`) prevent cross-tenant key collisions and
  index the tenant filter (`@@index([tenantId])` on every scoped model).
- Services are stateless; the Prisma client is a singleton; the per-request scoped client is
  cheap to create (extension over the cached base client).
- The workflow engine, notifications and documents are generic frameworks — Phase 2–7 modules
  plug into them without refactoring. Phase 2 (Procurement) does exactly that: requisitions and
  purchase orders sync their status into the workflow engine (`requisition_approval` /
  `po_approval` instances), and every procurement document reuses the comments, documents and
  audit frameworks.
- Procurement documents (PR/PO/GRN/INSP/WR) get sequential human-readable numbers from a
  per-tenant `DocumentSequence` table (e.g. `PO-2026-0007`), allocated transactionally by
  `NumberingService`.
- The 4-point fabric inspection rule (points normalized per 100 m; ≥15 → reject, 8–14.9 → second
  quality, <8 → approved) lives in the inspections service — the single source of truth for
  inspection decisions.
- Redis is provisioned in `docker-compose.yml` for Phases 2+ (queue/cache). Documents use a
  single local `FileService`; the rest of the app depends only on that seam, so introducing
  Cloudinary/S3 later is a one-file change (YAGNI — no provider abstraction until a real
  requirement exists).
