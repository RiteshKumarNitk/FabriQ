import { PrismaClient } from '@prisma/client';
import { DEFAULT_TENANT_SETTINGS, PERMISSIONS, SettingScope } from '@fabriq/shared';

/**
 * Default permission matrix assigned to each system tenant role. Consumed by
 * both the seed and the live tenant-creation endpoint so provisioning stays
 * identical everywhere.
 */
export const TENANT_ROLE_PERMISSION_MATRIX: Record<string, string[]> = {
  // platform:manage is a platform-level permission — tenant admins must never
  // receive it (it would let a customer provision/manage tenants).
  TENANT_ADMIN: PERMISSIONS.filter((p) => p.code !== 'platform:manage').map((p) => p.code),
  FACTORY_MANAGER: [
    'dashboard:read',
    'company:read', 'factory:read', 'warehouse:read', 'warehouse:create', 'warehouse:update',
    'orgunit:read', 'orgunit:create', 'orgunit:update',
    'user:read', 'role:read', 'permission:read',
    'setting:read', 'masterdata:read', 'masterdata:create', 'masterdata:update',
    'audit:read',
    'document:read', 'document:create',
    'notification:read',
    'workflow:read', 'workflow:approve',
    // Procurement
    'supplier:read', 'supplier:create', 'supplier:update', 'supplier:delete',
    'requisition:read', 'requisition:create', 'requisition:update', 'requisition:delete', 'requisition:approve',
    'purchaseorder:read', 'purchaseorder:create', 'purchaseorder:update', 'purchaseorder:delete', 'purchaseorder:approve',
    'grn:read', 'grn:create', 'grn:update', 'grn:delete',
    'inspection:read', 'inspection:create', 'inspection:update', 'inspection:delete',
    'warehousereceipt:read', 'warehousereceipt:create', 'warehousereceipt:update', 'warehousereceipt:delete',
    'stock:read',
  ],
  SUPERVISOR: [
    'dashboard:read',
    'company:read', 'factory:read', 'warehouse:read',
    'orgunit:read',
    'user:read',
    'masterdata:read',
    'document:read', 'document:create',
    'notification:read',
    'workflow:read', 'workflow:approve',
    // Procurement
    'supplier:read',
    'requisition:read', 'requisition:create', 'requisition:update',
    'purchaseorder:read',
    'grn:read', 'grn:create', 'grn:update',
    'inspection:read', 'inspection:create', 'inspection:update',
    'warehousereceipt:read',
    'stock:read',
  ],
  OPERATOR: [
    'dashboard:read',
    'factory:read', 'warehouse:read', 'orgunit:read', 'masterdata:read',
    'document:read', 'notification:read', 'workflow:read',
    // Procurement
    'supplier:read', 'requisition:read', 'purchaseorder:read', 'grn:read',
    'inspection:read', 'warehousereceipt:read', 'stock:read',
  ],
  VIEWER: [
    'dashboard:read', 'factory:read', 'warehouse:read', 'orgunit:read',
    'masterdata:read', 'document:read', 'notification:read', 'workflow:read',
    // Procurement
    'supplier:read', 'requisition:read', 'purchaseorder:read', 'grn:read',
    'inspection:read', 'warehousereceipt:read', 'stock:read',
  ],
};

export async function provisionTenantRoles(prisma: PrismaClient, tenantId: string): Promise<void> {
  for (const [code, permissionCodes] of Object.entries(TENANT_ROLE_PERMISSION_MATRIX)) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId, code } },
      create: { tenantId, code, name: code.replace(/_/g, ' '), description: 'System tenant role', isSystem: true },
      update: {},
    });
    const perms = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    for (const perm of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
    }
    // Two-way sync: revoke anything not in the matrix so system roles never
    // drift (e.g. platform:manage granted before this guard existed). Runs
    // only for system roles (the loop above iterates the matrix), so custom
    // roles are untouched. Trade-off: manual permission edits made to a
    // *system* role via the Roles UI are reverted on the next re-provision
    // (seed or new-tenant creation).
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permission: { code: { notIn: permissionCodes } } },
    });
  }
}

export async function provisionTenantSettings(prisma: PrismaClient, tenantId: string): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_TENANT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: {
        tenantId,
        key,
        value: JSON.parse(JSON.stringify(value)),
        scope: SettingScope.TENANT,
        group: key.split('.')[0],
      },
      update: { value: JSON.parse(JSON.stringify(value)) },
    });
  }
}

export async function provisionTenant(prisma: PrismaClient, tenantId: string): Promise<void> {
  await provisionTenantRoles(prisma, tenantId);
  await provisionTenantSettings(prisma, tenantId);
}
