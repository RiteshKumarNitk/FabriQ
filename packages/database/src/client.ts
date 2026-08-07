import { PrismaClient } from '@prisma/client';
import type { RequestContext } from '@fabriq/shared';

/**
 * Models that carry a tenantId column. Everything in this set is filtered /
 * stamped automatically by the extension below — tenant isolation cannot be
 * accidentally bypassed by a service.
 *
 * Excluded (no tenantId column): Tenant, Permission, RolePermission, UserRole.
 */
const TENANT_SCOPED_MODELS = new Set<string>([
  'Company',
  'Factory',
  'Warehouse',
  'Department',
  'Section',
  'ProductionLine',
  'User',
  'Role',
  'RefreshToken',
  'AuditLog',
  'Setting',
  'MasterDataCategory',
  'MasterDataItem',
  'Document',
  'Notification',
  'Comment',
  'WorkflowDefinition',
  'WorkflowStep',
  'WorkflowInstance',
  'WorkflowTask',
  // Phase 2 — Procurement
  'DocumentSequence',
  'Supplier',
  'PurchaseRequisition',
  'PurchaseRequisitionItem',
  'PurchaseOrder',
  'PurchaseOrderItem',
  'GoodsReceiptNote',
  'GrnRoll',
  'FabricInspection',
  'FabricInspectionDefect',
  'WarehouseReceipt',
  'StockTransaction',
]);

export function createBaseClient(): PrismaClient {
  return new PrismaClient();
}

/**
 * Returns a tenant-scoped Prisma client bound to the current request context.
 *
 * - Reads/updates/deletes: `tenantId` is injected into `where`.
 * - Creates: `tenantId` is stamped onto the data.
 * - When no tenant context exists (platform-level operations) scoped creates
 *   fail fast and scoped reads return nothing — the platform path must use
 *   the raw client and set tenantId explicitly.
 */
export function createTenantScopedClient(base: PrismaClient, ctx: RequestContext) {
  const tenantId = ctx.tenantId ?? null;
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          if (!TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }
          const a: any = args ?? {};
          switch (operation) {
            case 'create': {
              if (!tenantId) {
                throw new Error(
                  `Tenant context required to create ${model}. Use the raw client and set tenantId explicitly.`,
                );
              }
              return query({ ...a, data: { ...(a.data ?? {}), tenantId } });
            }
            case 'createMany': {
              if (!tenantId) {
                throw new Error(`Tenant context required to createMany ${model}.`);
              }
              const rows = (a.data as any[]).map((row: any) => ({ ...row, tenantId }));
              return query({ ...a, data: rows });
            }
            case 'upsert': {
              if (!tenantId) {
                throw new Error(`Tenant context required to upsert ${model}.`);
              }
              return query({
                ...a,
                where: { ...(a.where ?? {}), tenantId },
                create: { ...(a.create ?? {}), tenantId },
                update: a.update ?? {},
              });
            }
            default: {
              // findMany, findFirst, findUnique(+OrThrow), count, aggregate,
              // groupBy, update(+Many), delete(+Many) — all filter on `where`.
              if (!tenantId) {
                // Platform-level request on a tenant-scoped model: fail closed.
                // Reads return nothing (never throw Prisma validation errors
                // from injecting `tenantId: null` into non-nullable columns);
                // mutations throw a clear error so callers use the raw client.
                if (operation.startsWith('find')) {
                  if (operation.includes('First') || operation.includes('Unique')) return null;
                  return [];
                }
                if (operation === 'count') return 0;
                if (operation === 'aggregate') return { _count: 0 };
                if (operation === 'groupBy') return [];
                throw new Error(
                  `Tenant context required to ${operation} ${model}. Use the raw client and set tenantId explicitly.`,
                );
              }
              return query({ ...a, where: { ...(a.where ?? {}), tenantId } });
            }
          }
        },
      },
    },
  });
}

/** Audit stamping applied to creates/updates by services. */
export function auditFields(ctx: RequestContext | undefined): {
  createdBy: string | null;
  updatedBy: string | null;
} {
  return { createdBy: ctx?.userId ?? null, updatedBy: ctx?.userId ?? null };
}

/** Optimistic-concurrency-style version bump used on every update. */
export const versionBump = { version: { increment: 1 } };
