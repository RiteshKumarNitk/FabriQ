# FabriQ — Enterprise Multi-Tenant Garment Manufacturing Management Platform

FabriQ is a production-grade, multi-tenant SaaS platform for garment manufacturers, built to
compete with LOGIC ERP, Ginesys, VasyERP, WFX, and similar enterprise apparel ERPs. It manages
the complete manufacturing lifecycle — Purchase → Goods Receipt → Fabric Inspection → Warehouse →
Inventory → Production Planning → Fabric Allocation → Cutting → Bundling → Sewing → Quality →
Finishing → Packing → Dispatch → Reporting — with every transaction traceable and auditable.

> **Status:** Phase 1 — Platform Foundation (complete) · Phase 2 — Procurement (complete).
> Phases 3–7 (Inventory, Production, Quality, Logistics, Reporting) build on this foundation.

## Architecture at a glance

```
apps/
  web        Next.js 14 (App Router) · React 18 · TypeScript · Tailwind · shadcn-style UI ·
             TanStack Table · React Hook Form · Zod
  api        NestJS 10 · TypeScript · Prisma ORM · PostgreSQL
packages/
  shared     Enums · RBAC permission catalog · API contract types (single source of truth)
  database   Prisma schema · tenant-scoped client (tenant isolation at the query layer) ·
             tenant provisioning · seed
docs/        Architecture, database schema, API contract, module documentation
infrastructure/  (reserved — Kubernetes manifests, CI/CD in later phases)
scripts/     Local setup & dev helpers
```

Clean Architecture is enforced by layers: **Presentation** (controllers/routes) → **Application**
(services) → **Domain** (packages/shared enums & rules) → **Infrastructure** (Prisma, storage,
JWT). No business logic lives in controllers or UI components.

## Multi-tenancy

```
Platform → Tenant → Company → Factory → Warehouse → Department → Section → Production Line → User
```

Every business record carries `tenantId` and is filtered automatically by a **Prisma Client
extension** (`packages/database/src/client.ts`) driven by an `AsyncLocalStorage` request context.
Tenant isolation is enforced at the data-access layer — services and queries cannot accidentally
cross tenants, and unauthenticated/platform-level requests fail closed.

## Getting started

Prerequisites: **Node 20+**, **Docker** (for Postgres/Redis/MinIO — or an existing PostgreSQL).

```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure (PostgreSQL, Redis)
pnpm run infra:up

# 3. Create the database schema
pnpm run db:push          # or: pnpm run db:migrate (prisma migrate dev)

# 4. Seed the platform (permissions, roles, demo tenant, sample data)
pnpm run db:seed

# 5. Run both apps (API on :3001, Web on :3000)
pnpm run dev
```

Open:
- Web app → http://localhost:3000
- Swagger/OpenAPI → http://localhost:3001/api/docs
- Prisma Studio → `pnpm run db:studio`

### Demo credentials (seeded)

| Role | Email | Password |
|---|---|---|
| Platform Admin | `admin@fabriq.local` | `Admin@123` |
| Tenant Admin | `owner@acme.test` | `Demo@123` |
| Factory Manager | `manager@acme.test` | `Demo@123` |
| Supervisor | `supervisor@acme.test` | `Demo@123` |
| Operator | `operator@acme.test` | `Demo@123` |

> **No Docker / existing Postgres?** Point `DATABASE_URL` in `.env` at your own server
> (e.g. `postgresql://postgres:<your-password>@localhost:5432/fabriq`) and run `db:push` + `db:seed`.

## Useful commands

| Command | Purpose |
|---|---|
| `pnpm run dev` | Run API + Web (Turborepo watch) |
| `pnpm run build` | Build all packages/apps |
| `pnpm run typecheck` | Typecheck everything |
| `pnpm run db:generate` | Regenerate Prisma client |
| `pnpm run db:seed` | Seed the platform |
| `pnpm run db:studio` | Browse the database |

## Phase 1 — Platform Foundation (delivered)

| Capability | Implementation |
|---|---|
| Authentication | JWT access (15 min) + rotating hashed refresh tokens, bcrypt password hashing, throttling |
| Authorization | RBAC with permission codes (`tenant:read`, `user:update`, …) enforced by a guard; platform-admin bypass |
| Tenant management | Create tenant → transactional provisioning of system roles + default settings |
| Company / Factory / Warehouse | Tenant-scoped CRUD with cross-entity reference validation |
| Organization structure | Departments → Sections → Production Lines, with an org-tree endpoint |
| User management | Password hashing, role assignment, reset-password |
| Role & permission management | Permission catalog from `@fabriq/shared` (single source of truth), permission sync |
| Settings | Grouped key–value configuration, seeded defaults per tenant |
| Master data | Categories + items (fabric type, color, size, …) with dropdown options endpoint |
| Audit log | Immutable, interceptor-driven, with sanitized request bodies |
| Workflow framework | Generic definition → instance → task engine with role-based assignment, approve/reject, notifications |
| Notifications | In-app inbox, unread counts, read-all |
| Documents | Upload/download via a simple local `FileService` — the only storage seam; swap its internals when a real Cloudinary/S3 requirement appears |
| Comments | Entity-scoped discussion threads (timeline) |

Every module ships: list (search/filter/sort/pagination/export), create, edit, detail with
activity timeline, attachments, comments, approval view, and RBAC-gated actions — driven by a
single **config-driven generic entity system** (`apps/web/src/lib/entities.ts`).

## Phase 2 — Procurement (delivered)

Full purchasing lifecycle from supplier registration to approved fabric in the warehouse:

| Capability | Implementation |
|---|---|
| Supplier management | Entity-style CRUD with GST/PAN/bank details, addresses, contacts, active/inactive |
| Purchase requisitions | Header + line items, Draft → Submitted → Approved workflow (syncs to the workflow engine), convert-to-PO |
| Purchase orders | Multi-item, rate/GST/discount totals, supplier & terms, Draft → Approved → Partially Received → Completed, HTML print |
| Goods receipts (GRN) | Roll-level receiving with roll/color/GSM/width/length/weight/batch/lot, partial & multiple receipts, damaged-roll handling, PO status recalc |
| Fabric inspection | 4-point inspection system — points normalized per 100 m, Approved / Rejected / Second Quality, quality score |
| Warehouse receipt | Approved rolls → warehouse/rack/shelf/bin, stock transactions + ledger, full traceability |
| Stock | Tenant-scoped stock ledger, current balances by warehouse/fabric/roll, transaction history |
| Document numbering | `DocumentSequence` — sequential `PR-YYYY-NNNN` / `PO-YYYY-NNNN` / `GRN-…` / `INSP-…` / `WR-…` per tenant |

Every document supports comments, attachments, audit logs, activity timeline, search/filter/
pagination/export, and RBAC-gated actions — see [the module doc](docs/modules/procurement.md).

## Roadmap

- **Phase 3 — Inventory:** warehouses, stock ledger, fabric rolls, transfers, adjustments, barcodes/QR, inventory reports.
- **Phase 4 — Production:** planning, marker planning, fabric allocation, relaxation, spreading, cutting, bundles, sewing, finishing, packing.
- **Phase 5 — Quality:** incoming/inline/end-line/final inspection, defect library, quality reports.
- **Phase 6 — Logistics:** dispatch, shipment, vehicle, delivery notes, transport.
- **Phase 7 — Reporting:** operational dashboards, exports, management reports.

Each phase reuses the Phase 1 frameworks (tenant scoping, audit, workflows, notifications,
documents, master data, generic UI) — no architectural refactoring required.

## Documentation

- [Architecture](docs/architecture.md)
- [Database schema](docs/database-schema.md)
- [API contract](docs/api.md)
- [Phase 1 module documentation](docs/modules/platform-foundation.md)
- [Phase 2 — Procurement module](docs/modules/procurement.md)
