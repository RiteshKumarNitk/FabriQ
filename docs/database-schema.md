# Database Schema

Source of truth: `packages/database/prisma/schema.prisma`. Managed with Prisma migrations /
`db push`. PostgreSQL 16.

## Conventions

Every business table carries:

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | Generated via `@default(uuid())` |
| `tenantId` | FK → Tenant | Owner of the record (enforced by the tenant-scoped client) |
| `companyId`, `factoryId` | FK (nullable) | Org context |
| `createdOn` / `createdBy` | DateTime / String? | Audit |
| `updatedOn` / `updatedBy` | DateTime / String? | Audit (`@updatedAt`) |
| `deletedOn` / `deletedBy` | DateTime? / String? | Soft delete |
| `isDeleted` | Boolean | Soft-delete flag (default false) |
| `version` | Int | Optimistic version, incremented on every update |

- **Soft delete**: services archive (`isDeleted = true`) instead of deleting; reads filter
  `isDeleted = false`.
- **Uniqueness**: tenant-scoped composite keys (`@@unique([tenantId, code])`) prevent code
  collisions across tenants and match the tenant index.
- **Indexes**: every scoped model has `@@index([tenantId])`; hot query paths
  (entity lookups, notifications, audit) get targeted composite indexes.

## Entity-relationship overview

```
Tenant 1─* Company 1─* Factory
                       └─* Warehouse (company + optional factory)
                       └─* Department 1─* Section
                       └─* ProductionLine (optional department)
Tenant 1─* User *─* Role *─* Permission        (UserRole / RolePermission joins)
User 1─* RefreshToken        (hashed, rotating)
Tenant 1─* Setting           (key/value, scoped)
Tenant 1─* MasterDataCategory 1─* MasterDataItem
Tenant 1─* AuditLog          (immutable)
Tenant 1─* Document          (polymorphic entityType/entityId)
Tenant 1─* Notification      (per-user inbox)
Tenant 1─* Comment           (polymorphic entityType/entityId)
Tenant 1─* WorkflowDefinition 1─* WorkflowStep
          1─* WorkflowInstance 1─* WorkflowTask
```

Polymorphic references (`entityType` + `entityId` on Document, Comment, AuditLog,
WorkflowInstance) let the generic frameworks attach to any business entity introduced in later
phases without schema changes.

## Table reference (Phase 1)

| Model | Key columns | Unique |
|---|---|---|
| Tenant | code, name, status, plan | code |
| Company | tenantId, code, name, gstin, status | (tenantId, code) |
| Factory | tenantId, companyId, code, name, status | (tenantId, code) |
| Warehouse | tenantId, companyId, factoryId?, code, type, isActive | (tenantId, code) |
| Department | tenantId, factoryId, code, name | (tenantId, factoryId, code) |
| Section | tenantId, departmentId, code, name | (tenantId, departmentId, code) |
| ProductionLine | tenantId, factoryId, departmentId?, code, capacity, status | (tenantId, factoryId, code) |
| User | tenantId?, companyId?, factoryId?, email, passwordHash, status, isPlatformAdmin | email (global) |
| Role | tenantId?, code, name, isSystem | (tenantId, code) |
| Permission | code, module, name | code (global catalog) |
| RolePermission | roleId, permissionId | (roleId, permissionId) |
| UserRole | userId, roleId | (userId, roleId) |
| RefreshToken | userId, tokenHash, expiresAt, revokedAt, replacedByTokenId | tokenHash |
| AuditLog | tenantId?, action, module, entityType, entityId?, requestBody, ip | — |
| Setting | tenantId?, key, value (JSON) | (tenantId, key) |
| MasterDataCategory | tenantId, code, name | (tenantId, code) |
| MasterDataItem | tenantId, categoryId, code, name, attributes | (tenantId, categoryId, code) |
| Document | tenantId, entityType, entityId, storageKey, mimeType, sizeBytes | — |
| Notification | tenantId?, userId, type, isRead | — |
| Comment | tenantId?, entityType, entityId, userId, body | — |
| WorkflowDefinition | tenantId, code, entityType, isActive | (tenantId, code) |
| WorkflowStep | workflowDefinitionId, stepOrder, isApproval, assigneeRoleCode | (workflowDefinitionId, stepOrder) |
| WorkflowInstance | workflowDefinitionId, entityType, entityId, status, currentStepId | — |
| WorkflowTask | workflowInstanceId, stepId, assigneeRoleCode?, status | — |

Nullable `tenantId` on User/Role/Setting/AuditLog/Document/Notification/Comment marks
platform-level records (e.g. the PLATFORM_ADMIN user/role).

## Enums

`TenantStatus`, `EntityStatus`, `UserStatus`, `WarehouseType`, `ProductionLineStatus`,
`AuditAction`, `SettingScope`, `DocumentCategory`, `NotificationType`, `WorkflowStatus`,
`WorkflowTaskStatus` — mirrored 1:1 in `packages/shared/src/enums.ts` (the single source of truth
consumed by the UI).
