/**
 * The permission catalog — the single source of truth for RBAC.
 *
 * Every guard decision uses a code from this catalog; the database
 * Permission table is kept in sync with it by the permissions module
 * (idempotent sync on bootstrap / seed).
 */
export interface PermissionDef {
  code: string;
  module: string;
  name: string;
  description: string;
}

export const PERMISSIONS: readonly PermissionDef[] = [
  // Platform
  { code: 'platform:manage', module: 'Platform', name: 'Manage Platform', description: 'Create and manage tenants on the platform' },

  // Dashboard
  { code: 'dashboard:read', module: 'Dashboard', name: 'View Dashboard', description: 'View operational dashboards and KPIs' },

  // Organization
  { code: 'company:read', module: 'Organization', name: 'View Companies', description: 'View companies' },
  { code: 'company:create', module: 'Organization', name: 'Create Companies', description: 'Create companies' },
  { code: 'company:update', module: 'Organization', name: 'Update Companies', description: 'Update companies' },
  { code: 'company:delete', module: 'Organization', name: 'Delete Companies', description: 'Delete companies' },
  { code: 'factory:read', module: 'Organization', name: 'View Factories', description: 'View factories' },
  { code: 'factory:create', module: 'Organization', name: 'Create Factories', description: 'Create factories' },
  { code: 'factory:update', module: 'Organization', name: 'Update Factories', description: 'Update factories' },
  { code: 'factory:delete', module: 'Organization', name: 'Delete Factories', description: 'Delete factories' },
  { code: 'warehouse:read', module: 'Organization', name: 'View Warehouses', description: 'View warehouses' },
  { code: 'warehouse:create', module: 'Organization', name: 'Create Warehouses', description: 'Create warehouses' },
  { code: 'warehouse:update', module: 'Organization', name: 'Update Warehouses', description: 'Update warehouses' },
  { code: 'warehouse:delete', module: 'Organization', name: 'Delete Warehouses', description: 'Delete warehouses' },
  { code: 'orgunit:read', module: 'Organization', name: 'View Org Structure', description: 'View departments, sections and lines' },
  { code: 'orgunit:create', module: 'Organization', name: 'Create Org Units', description: 'Create departments, sections and lines' },
  { code: 'orgunit:update', module: 'Organization', name: 'Update Org Units', description: 'Update departments, sections and lines' },
  { code: 'orgunit:delete', module: 'Organization', name: 'Delete Org Units', description: 'Delete departments, sections and lines' },

  // Identity & Access
  { code: 'user:read', module: 'Identity', name: 'View Users', description: 'View users' },
  { code: 'user:create', module: 'Identity', name: 'Create Users', description: 'Create users' },
  { code: 'user:update', module: 'Identity', name: 'Update Users', description: 'Update users' },
  { code: 'user:delete', module: 'Identity', name: 'Delete Users', description: 'Delete users' },
  { code: 'role:read', module: 'Identity', name: 'View Roles', description: 'View roles' },
  { code: 'role:create', module: 'Identity', name: 'Create Roles', description: 'Create roles' },
  { code: 'role:update', module: 'Identity', name: 'Update Roles', description: 'Update roles' },
  { code: 'role:delete', module: 'Identity', name: 'Delete Roles', description: 'Delete roles' },
  { code: 'permission:read', module: 'Identity', name: 'View Permissions', description: 'View the permission catalog' },

  // Settings & Master Data
  { code: 'setting:read', module: 'Configuration', name: 'View Settings', description: 'View configuration settings' },
  { code: 'setting:update', module: 'Configuration', name: 'Update Settings', description: 'Update configuration settings' },
  { code: 'masterdata:read', module: 'Configuration', name: 'View Master Data', description: 'View master data categories and items' },
  { code: 'masterdata:create', module: 'Configuration', name: 'Create Master Data', description: 'Create master data items' },
  { code: 'masterdata:update', module: 'Configuration', name: 'Update Master Data', description: 'Update master data items' },
  { code: 'masterdata:delete', module: 'Configuration', name: 'Delete Master Data', description: 'Delete master data items' },

  // Audit
  { code: 'audit:read', module: 'Audit', name: 'View Audit Logs', description: 'View audit logs' },

  // Documents
  { code: 'document:read', module: 'Documents', name: 'View Documents', description: 'View and download documents' },
  { code: 'document:create', module: 'Documents', name: 'Upload Documents', description: 'Upload documents' },
  { code: 'document:delete', module: 'Documents', name: 'Delete Documents', description: 'Delete documents' },

  // Notifications
  { code: 'notification:read', module: 'Notifications', name: 'View Notifications', description: 'View own notifications' },

  // Workflows
  { code: 'workflow:read', module: 'Workflows', name: 'View Workflows', description: 'View workflow definitions and tasks' },
  { code: 'workflow:create', module: 'Workflows', name: 'Configure Workflows', description: 'Create and update workflow definitions' },
  { code: 'workflow:delete', module: 'Workflows', name: 'Delete Workflows', description: 'Delete workflow definitions' },
  { code: 'workflow:approve', module: 'Workflows', name: 'Approve / Reject', description: 'Act on pending workflow tasks' },

  // Tenant management (tenant admins)
  { code: 'tenant:manage', module: 'Tenant', name: 'Manage Tenant', description: 'Manage the tenant profile and memberships' },

  // Procurement — Suppliers
  { code: 'supplier:read', module: 'Procurement', name: 'View Suppliers', description: 'View suppliers' },
  { code: 'supplier:create', module: 'Procurement', name: 'Create Suppliers', description: 'Create suppliers' },
  { code: 'supplier:update', module: 'Procurement', name: 'Update Suppliers', description: 'Update suppliers' },
  { code: 'supplier:delete', module: 'Procurement', name: 'Delete Suppliers', description: 'Delete suppliers' },

  // Procurement — Purchase Requisitions
  { code: 'requisition:read', module: 'Procurement', name: 'View Requisitions', description: 'View purchase requisitions' },
  { code: 'requisition:create', module: 'Procurement', name: 'Create Requisitions', description: 'Create purchase requisitions' },
  { code: 'requisition:update', module: 'Procurement', name: 'Update Requisitions', description: 'Update purchase requisitions' },
  { code: 'requisition:delete', module: 'Procurement', name: 'Delete Requisitions', description: 'Delete purchase requisitions' },
  { code: 'requisition:approve', module: 'Procurement', name: 'Approve Requisitions', description: 'Submit, approve and convert purchase requisitions' },

  // Procurement — Purchase Orders
  { code: 'purchaseorder:read', module: 'Procurement', name: 'View Purchase Orders', description: 'View purchase orders' },
  { code: 'purchaseorder:create', module: 'Procurement', name: 'Create Purchase Orders', description: 'Create purchase orders' },
  { code: 'purchaseorder:update', module: 'Procurement', name: 'Update Purchase Orders', description: 'Update purchase orders' },
  { code: 'purchaseorder:delete', module: 'Procurement', name: 'Delete Purchase Orders', description: 'Delete purchase orders' },
  { code: 'purchaseorder:approve', module: 'Procurement', name: 'Approve Purchase Orders', description: 'Submit, approve and print purchase orders' },

  // Procurement — Goods Receipt Notes
  { code: 'grn:read', module: 'Procurement', name: 'View Goods Receipts', description: 'View goods receipt notes' },
  { code: 'grn:create', module: 'Procurement', name: 'Create Goods Receipts', description: 'Create goods receipt notes' },
  { code: 'grn:update', module: 'Procurement', name: 'Update Goods Receipts', description: 'Update goods receipt notes' },
  { code: 'grn:delete', module: 'Procurement', name: 'Delete Goods Receipts', description: 'Delete goods receipt notes' },

  // Procurement — Fabric Inspection
  { code: 'inspection:read', module: 'Procurement', name: 'View Inspections', description: 'View fabric inspections' },
  { code: 'inspection:create', module: 'Procurement', name: 'Create Inspections', description: 'Create fabric inspections' },
  { code: 'inspection:update', module: 'Procurement', name: 'Update Inspections', description: 'Update fabric inspections' },
  { code: 'inspection:delete', module: 'Procurement', name: 'Delete Inspections', description: 'Delete fabric inspections' },

  // Procurement — Warehouse Receipt
  { code: 'warehousereceipt:read', module: 'Procurement', name: 'View Warehouse Receipts', description: 'View warehouse receipts' },
  { code: 'warehousereceipt:create', module: 'Procurement', name: 'Create Warehouse Receipts', description: 'Receive approved rolls into a warehouse' },
  { code: 'warehousereceipt:update', module: 'Procurement', name: 'Update Warehouse Receipts', description: 'Update warehouse receipts' },
  { code: 'warehousereceipt:delete', module: 'Procurement', name: 'Delete Warehouse Receipts', description: 'Delete warehouse receipts' },

  // Procurement — Stock (minimal Phase 2 hand-off; full Inventory in Phase 3)
  { code: 'stock:read', module: 'Procurement', name: 'View Stock', description: 'View stock transactions and balances' },

  // Cutting Room — fabric rolls
  { code: 'roll:read', module: 'Cutting', name: 'View Fabric Rolls', description: 'View fabric rolls, measurements and inspection' },
  { code: 'roll:create', module: 'Cutting', name: 'Create Fabric Rolls', description: 'Create fabric rolls and record measurements' },
  { code: 'roll:update', module: 'Cutting', name: 'Update Fabric Rolls', description: 'Update rolls, measurements and defects' },
  { code: 'roll:delete', module: 'Cutting', name: 'Archive Fabric Rolls', description: 'Archive fabric rolls' },

  // Cutting Room — markers
  { code: 'marker:read', module: 'Cutting', name: 'View Markers', description: 'View markers and pattern layouts' },
  { code: 'marker:create', module: 'Cutting', name: 'Create Markers', description: 'Create and duplicate markers' },
  { code: 'marker:update', module: 'Cutting', name: 'Update Markers', description: 'Edit markers, pattern pieces and finalize' },
  { code: 'marker:delete', module: 'Cutting', name: 'Archive Markers', description: 'Archive markers' },

  // Cutting Room — cut orders, lays and cutting
  { code: 'cutorder:read', module: 'Cutting', name: 'View Cut Orders', description: 'View cut orders, lay plans and output' },
  { code: 'cutorder:create', module: 'Cutting', name: 'Create Cut Orders', description: 'Create cut orders and lay plans' },
  { code: 'cutorder:update', module: 'Cutting', name: 'Update Cut Orders', description: 'Update cut orders, lays and record cutting' },
  { code: 'cutorder:delete', module: 'Cutting', name: 'Archive Cut Orders', description: 'Archive cut orders' },

  // Cutting Room — fabric master
  { code: 'fabric:read', module: 'Cutting', name: 'View Fabric Master', description: 'View the fabric catalog' },
  { code: 'fabric:create', module: 'Cutting', name: 'Create Fabrics', description: 'Create fabric master entries' },
  { code: 'fabric:update', module: 'Cutting', name: 'Update Fabrics', description: 'Update fabric master entries' },
  { code: 'fabric:delete', module: 'Cutting', name: 'Archive Fabrics', description: 'Archive fabric master entries' },

  // Cutting Room — pattern library
  { code: 'pattern:read', module: 'Cutting', name: 'View Pattern Library', description: 'View pattern sets and pieces' },
  { code: 'pattern:create', module: 'Cutting', name: 'Create Patterns', description: 'Create pattern sets, pieces and new revisions' },
  { code: 'pattern:update', module: 'Cutting', name: 'Update Patterns', description: 'Update pattern sets and pieces' },
  { code: 'pattern:delete', module: 'Cutting', name: 'Archive Patterns', description: 'Archive pattern sets' },

  // Cutting Room — remnants
  { code: 'remnant:read', module: 'Cutting', name: 'View Remnants', description: 'View fabric remnants' },
  { code: 'remnant:create', module: 'Cutting', name: 'Create Remnants', description: 'Close rolls and create remnants' },
  { code: 'remnant:update', module: 'Cutting', name: 'Update Remnants', description: 'Update remnant status and location' },
  { code: 'remnant:delete', module: 'Cutting', name: 'Archive Remnants', description: 'Archive remnants' },
];

export const PERMISSION_MODULES: readonly string[] = Array.from(
  new Set(PERMISSIONS.map((p) => p.module)),
);

export function permissionExists(code: string): boolean {
  return PERMISSIONS.some((p) => p.code === code);
}
