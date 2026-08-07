import {
  Building2,
  ClipboardList,
  Factory,
  FileText,
  GitBranch,
  LayoutDashboard,
  LineChart,
  ListTree,
  Lock,
  Package,
  PackageOpen,
  Palette,
  ScanSearch,
  Settings2,
  Shield,
  Truck,
  Users,
  Warehouse,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import {
  EntityStatus,
  ProductionLineStatus,
  TenantStatus,
  UserStatus,
  WarehouseType,
} from '@fabriq/shared';

export type FieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'textarea'
  | 'select'
  | 'ref'
  | 'multi'
  | 'boolean'
  | 'json';

export interface FieldOption {
  label: string;
  value: string;
  /** optional grouping (e.g. permission module) */
  group?: string;
}

export interface EntityField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** static options for select/multi */
  options?: FieldOption[];
  /** dynamic options endpoint (expects paginated { items: [...] }) */
  refPath?: string;
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  /** RegExp source as a string — RegExp instances aren't serializable across the RSC boundary */
  pattern?: string;
  patternMessage?: string;
  /** hidden in create/edit forms (display-only, e.g. id) */
  displayOnly?: boolean;
  /** only rendered when creating */
  createOnly?: boolean;
  /** included in the list table */
  column?: boolean;
  /** shown on the detail page */
  detail?: boolean;
}

export interface EntityConfig {
  key: string;
  label: string;
  plural: string;
  description: string;
  apiPath: string;
  icon: LucideIcon;
  group: string;
  permissions: { read: string; create: string; update: string; delete: string };
  fields: EntityField[];
  columns: string[];
  searchFields?: string[];
  canCreate?: boolean;
  canEdit?: boolean;
  canArchive?: boolean;
  /** platform-level entity (only visible to platform admins) */
  isPlatform?: boolean;
  /** entity supports the detail page (activity/documents/comments/workflows) */
  detail?: boolean;
}

/** EntityConfig without the icon (a function) — safe to pass across the RSC boundary. */
export type SafeEntityConfig = Omit<EntityConfig, 'icon'>;

const codeField: EntityField = {
  name: 'code',
  label: 'Code',
  type: 'text',
  required: true,
  placeholder: 'e.g. FAC-01',
  pattern: '^[A-Z0-9_-]+$',
  patternMessage: 'Uppercase letters, digits, _ and - only',
  column: true,
  detail: true,
};

const statusField = (options: FieldOption[], column = true): EntityField => ({
  name: 'status',
  label: 'Status',
  type: 'select',
  options,
  column,
  detail: true,
});

export const ENTITY_REGISTRY: EntityConfig[] = [
  // ── Platform ─────────────────────────────────────────────────────────────
  {
    key: 'tenants',
    label: 'Tenant',
    plural: 'Tenants',
    description: 'Platform customers. Each tenant is fully isolated.',
    apiPath: '/tenants',
    icon: Building2,
    group: 'Platform',
    isPlatform: true,
    permissions: { read: 'platform:manage', create: 'platform:manage', update: 'platform:manage', delete: 'platform:manage' },
    fields: [
      codeField,
      { name: 'name', label: 'Name', type: 'text', required: true, column: true, detail: true },
      statusField(
        Object.values(TenantStatus).map((v) => ({ label: v, value: v })),
      ),
      { name: 'plan', label: 'Plan', type: 'select', options: [{ label: 'Startup', value: 'startup' }, { label: 'Growth', value: 'growth' }, { label: 'Enterprise', value: 'enterprise' }], column: true, detail: true },
      { name: 'contactName', label: 'Contact Name', type: 'text', detail: true },
      { name: 'contactEmail', label: 'Contact Email', type: 'email', detail: true },
      { name: 'contactPhone', label: 'Contact Phone', type: 'text', detail: true },
      { name: 'city', label: 'City', type: 'text', detail: true },
      { name: 'state', label: 'State', type: 'text', detail: true },
      { name: 'country', label: 'Country', type: 'text', detail: true },
    ],
    columns: ['code', 'name', 'plan', 'status'],
    searchFields: ['code', 'name'],
  },

  // ── Organization ─────────────────────────────────────────────────────────
  {
    key: 'companies',
    label: 'Company',
    plural: 'Companies',
    description: 'Legal entities within a tenant.',
    apiPath: '/companies',
    icon: Building2,
    group: 'Organization',
    permissions: { read: 'company:read', create: 'company:create', update: 'company:update', delete: 'company:delete' },
    fields: [
      codeField,
      { name: 'name', label: 'Name', type: 'text', required: true, column: true, detail: true },
      { name: 'gstin', label: 'GSTIN', type: 'text', detail: true },
      { name: 'address', label: 'Address', type: 'textarea', detail: true },
      { name: 'city', label: 'City', type: 'text', column: true, detail: true },
      { name: 'state', label: 'State', type: 'text', detail: true },
      { name: 'country', label: 'Country', type: 'text', detail: true },
      { name: 'phone', label: 'Phone', type: 'text', detail: true },
      { name: 'email', label: 'Email', type: 'email', detail: true },
      statusField(Object.values(EntityStatus).map((v) => ({ label: v, value: v }))),
    ],
    columns: ['code', 'name', 'city', 'status'],
    searchFields: ['code', 'name', 'city'],
  },
  {
    key: 'factories',
    label: 'Factory',
    plural: 'Factories',
    description: 'Production facilities belonging to a company.',
    apiPath: '/factories',
    icon: Factory,
    group: 'Organization',
    permissions: { read: 'factory:read', create: 'factory:create', update: 'factory:update', delete: 'factory:delete' },
    fields: [
      codeField,
      { name: 'name', label: 'Name', type: 'text', required: true, column: true, detail: true },
      { name: 'companyId', label: 'Company', type: 'ref', refPath: '/companies', required: true },
      { name: 'address', label: 'Address', type: 'textarea', detail: true },
      { name: 'city', label: 'City', type: 'text', column: true, detail: true },
      { name: 'state', label: 'State', type: 'text', detail: true },
      { name: 'country', label: 'Country', type: 'text', detail: true },
      statusField(Object.values(EntityStatus).map((v) => ({ label: v, value: v }))),
    ],
    columns: ['code', 'name', 'city', 'status'],
    searchFields: ['code', 'name', 'city'],
  },
  {
    key: 'warehouses',
    label: 'Warehouse',
    plural: 'Warehouses',
    description: 'Storage locations by type (raw material, WIP, finished goods).',
    apiPath: '/warehouses',
    icon: Warehouse,
    group: 'Organization',
    permissions: { read: 'warehouse:read', create: 'warehouse:create', update: 'warehouse:update', delete: 'warehouse:delete' },
    fields: [
      codeField,
      { name: 'name', label: 'Name', type: 'text', required: true, column: true, detail: true },
      { name: 'companyId', label: 'Company', type: 'ref', refPath: '/companies', required: true },
      { name: 'factoryId', label: 'Factory', type: 'ref', refPath: '/factories' },
      { name: 'type', label: 'Type', type: 'select', options: Object.values(WarehouseType).map((v) => ({ label: v.replace(/_/g, ' '), value: v })), column: true, detail: true },
      { name: 'address', label: 'Address', type: 'textarea', detail: true },
      { name: 'isActive', label: 'Active', type: 'boolean', column: true, detail: true },
    ],
    columns: ['code', 'name', 'type', 'isActive'],
    searchFields: ['code', 'name'],
  },
  {
    key: 'departments',
    label: 'Department',
    plural: 'Departments',
    description: 'Production departments within a factory.',
    apiPath: '/org-units/departments',
    icon: GitBranch,
    group: 'Organization',
    permissions: { read: 'orgunit:read', create: 'orgunit:create', update: 'orgunit:update', delete: 'orgunit:delete' },
    fields: [
      codeField,
      { name: 'name', label: 'Name', type: 'text', required: true, column: true, detail: true },
      { name: 'factoryId', label: 'Factory', type: 'ref', refPath: '/factories', required: true },
    ],
    columns: ['code', 'name'],
    searchFields: ['code', 'name'],
  },
  {
    key: 'sections',
    label: 'Section',
    plural: 'Sections',
    description: 'Sections inside a department.',
    apiPath: '/org-units/sections',
    icon: ListTree,
    group: 'Organization',
    permissions: { read: 'orgunit:read', create: 'orgunit:create', update: 'orgunit:update', delete: 'orgunit:delete' },
    fields: [
      codeField,
      { name: 'name', label: 'Name', type: 'text', required: true, column: true, detail: true },
      { name: 'departmentId', label: 'Department', type: 'ref', refPath: '/org-units/departments', required: true },
    ],
    columns: ['code', 'name'],
    searchFields: ['code', 'name'],
  },
  {
    key: 'lines',
    label: 'Production Line',
    plural: 'Production Lines',
    description: 'Production lines with operator capacity.',
    apiPath: '/org-units/lines',
    icon: LineChart,
    group: 'Organization',
    permissions: { read: 'orgunit:read', create: 'orgunit:create', update: 'orgunit:update', delete: 'orgunit:delete' },
    fields: [
      codeField,
      { name: 'name', label: 'Name', type: 'text', required: true, column: true, detail: true },
      { name: 'factoryId', label: 'Factory', type: 'ref', refPath: '/factories', required: true },
      { name: 'departmentId', label: 'Department', type: 'ref', refPath: '/org-units/departments' },
      { name: 'capacity', label: 'Capacity (operators)', type: 'number', column: true, detail: true },
      { name: 'status', label: 'Status', type: 'select', options: Object.values(ProductionLineStatus).map((v) => ({ label: v, value: v })), column: true, detail: true },
    ],
    columns: ['code', 'name', 'capacity', 'status'],
    searchFields: ['code', 'name'],
  },

  // ── Identity & Access ────────────────────────────────────────────────────
  {
    key: 'users',
    label: 'User',
    plural: 'Users',
    description: 'People with access to this tenant.',
    apiPath: '/users',
    icon: Users,
    group: 'Identity & Access',
    permissions: { read: 'user:read', create: 'user:create', update: 'user:update', delete: 'user:delete' },
    fields: [
      { name: 'firstName', label: 'First Name', type: 'text', required: true, column: true, detail: true },
      { name: 'lastName', label: 'Last Name', type: 'text', required: true, column: true, detail: true },
      { name: 'email', label: 'Email', type: 'email', required: true, column: true, detail: true },
      { name: 'phone', label: 'Phone', type: 'text', detail: true },
      { name: 'password', label: 'Password', type: 'password', createOnly: true, required: true, minLength: 8 },
      { name: 'companyId', label: 'Company', type: 'ref', refPath: '/companies' },
      { name: 'factoryId', label: 'Factory', type: 'ref', refPath: '/factories' },
      { name: 'roleIds', label: 'Roles', type: 'multi', refPath: '/roles', help: 'Assign one or more roles' },
      statusField(Object.values(UserStatus).map((v) => ({ label: v, value: v }))),
      { name: 'lastLoginAt', label: 'Last Login', type: 'text', displayOnly: true, detail: true },
    ],
    columns: ['firstName', 'lastName', 'email', 'status'],
    searchFields: ['firstName', 'lastName', 'email'],
    detail: true,
  },
  {
    key: 'roles',
    label: 'Role',
    plural: 'Roles',
    description: 'Named bundles of permissions assigned to users.',
    apiPath: '/roles',
    icon: Shield,
    group: 'Identity & Access',
    permissions: { read: 'role:read', create: 'role:create', update: 'role:update', delete: 'role:delete' },
    fields: [
      codeField,
      { name: 'name', label: 'Name', type: 'text', required: true, column: true, detail: true },
      { name: 'description', label: 'Description', type: 'textarea', detail: true },
      { name: 'permissionCodes', label: 'Permissions', type: 'multi', refPath: '/permissions', help: 'Permissions granted to this role' },
    ],
    columns: ['code', 'name'],
    searchFields: ['code', 'name'],
    detail: true,
  },
  {
    key: 'permissions',
    label: 'Permission',
    plural: 'Permissions',
    description: 'The RBAC permission catalog (read-only).',
    apiPath: '/permissions',
    icon: Lock,
    group: 'Identity & Access',
    permissions: { read: 'permission:read', create: 'permission:read', update: 'permission:read', delete: 'permission:read' },
    canCreate: false,
    canEdit: false,
    canArchive: false,
    detail: false,
    fields: [
      { name: 'code', label: 'Code', type: 'text', column: true },
      { name: 'name', label: 'Name', type: 'text', column: true },
      { name: 'module', label: 'Module', type: 'text', column: true },
      { name: 'description', label: 'Description', type: 'text', column: true },
    ],
    columns: ['code', 'name', 'module', 'description'],
    searchFields: ['code', 'name', 'module'],
  },

  // ── Configuration ────────────────────────────────────────────────────────
  {
    key: 'master-data',
    label: 'Master Data',
    plural: 'Master Data',
    description: 'Configurable reference data: fabric types, colors, sizes, categories.',
    apiPath: '/master-data/categories',
    icon: Palette,
    group: 'Configuration',
    permissions: { read: 'masterdata:read', create: 'masterdata:create', update: 'masterdata:update', delete: 'masterdata:delete' },
    fields: [
      codeField,
      { name: 'name', label: 'Name', type: 'text', required: true, column: true, detail: true },
      { name: 'description', label: 'Description', type: 'textarea', detail: true },
    ],
    columns: ['code', 'name'],
    searchFields: ['code', 'name'],
  },
  {
    key: 'master-items',
    label: 'Master Data Item',
    plural: 'Master Data Items',
    description: 'Values inside a master data category.',
    apiPath: '/master-data/items',
    icon: Package,
    group: 'Configuration',
    permissions: { read: 'masterdata:read', create: 'masterdata:create', update: 'masterdata:update', delete: 'masterdata:delete' },
    fields: [
      codeField,
      { name: 'name', label: 'Name', type: 'text', required: true, column: true, detail: true },
      { name: 'categoryId', label: 'Category', type: 'ref', refPath: '/master-data/categories', required: true },
      { name: 'isActive', label: 'Active', type: 'boolean', column: true, detail: true },
      { name: 'sortOrder', label: 'Sort Order', type: 'number', column: true, detail: true },
      { name: 'attributes', label: 'Attributes', type: 'json', help: 'Optional JSON object' },
    ],
    columns: ['code', 'name', 'isActive', 'sortOrder'],
    searchFields: ['code', 'name'],
  },
  {
    key: 'workflow-definitions',
    label: 'Workflow Definition',
    plural: 'Workflow Definitions',
    description: 'Approval flows for business documents.',
    apiPath: '/workflows',
    icon: Workflow,
    group: 'Configuration',
    permissions: { read: 'workflow:read', create: 'workflow:create', update: 'workflow:create', delete: 'workflow:delete' },
    fields: [
      codeField,
      { name: 'name', label: 'Name', type: 'text', required: true, column: true, detail: true },
      { name: 'entityType', label: 'Applies To (entity type)', type: 'text', required: true, placeholder: 'e.g. purchase-requisition', column: true, detail: true },
      { name: 'description', label: 'Description', type: 'textarea', detail: true },
      { name: 'isActive', label: 'Active', type: 'boolean', column: true, detail: true },
      {
        name: 'steps',
        label: 'Steps (JSON)',
        type: 'json',
        help: '[{"stepOrder":1,"name":"Supervisor Review","isApproval":true,"assigneeRoleCode":"SUPERVISOR"}, ...]',
      },
    ],
    columns: ['code', 'name', 'entityType', 'isActive'],
    searchFields: ['code', 'name', 'entityType'],
    detail: true,
  },

  // ── Procurement ─────────────────────────────────────────────────────────
  {
    key: 'suppliers',
    label: 'Supplier',
    plural: 'Suppliers',
    description: 'Fabric and material vendors with trading, banking and contact details.',
    apiPath: '/suppliers',
    icon: Truck,
    group: 'Procurement',
    permissions: { read: 'supplier:read', create: 'supplier:create', update: 'supplier:update', delete: 'supplier:delete' },
    fields: [
      codeField,
      { name: 'name', label: 'Supplier Name', type: 'text', required: true, column: true, detail: true },
      { name: 'businessName', label: 'Business Name', type: 'text', detail: true },
      { name: 'gstin', label: 'GST Number', type: 'text', detail: true },
      { name: 'pan', label: 'PAN Number', type: 'text', detail: true },
      { name: 'contactPerson', label: 'Contact Person', type: 'text', column: true, detail: true },
      { name: 'email', label: 'Email', type: 'email', column: true, detail: true },
      { name: 'mobile', label: 'Mobile', type: 'text', detail: true },
      { name: 'officePhone', label: 'Office Phone', type: 'text', detail: true },
      { name: 'website', label: 'Website', type: 'text', detail: true },
      { name: 'billingAddress', label: 'Billing Address', type: 'textarea', detail: true },
      { name: 'shippingAddress', label: 'Shipping Address', type: 'textarea', detail: true },
      { name: 'city', label: 'City', type: 'text', column: true, detail: true },
      { name: 'state', label: 'State', type: 'text', detail: true },
      { name: 'country', label: 'Country', type: 'text', detail: true },
      { name: 'pincode', label: 'Pincode', type: 'text', detail: true },
      { name: 'paymentTerms', label: 'Payment Terms', type: 'text', detail: true },
      { name: 'creditDays', label: 'Credit Days', type: 'number', min: 0, column: true, detail: true },
      { name: 'currency', label: 'Currency', type: 'text', detail: true },
      { name: 'bankName', label: 'Bank Name', type: 'text', detail: true },
      { name: 'bankAccountNumber', label: 'Bank Account No.', type: 'text', detail: true },
      { name: 'bankIfsc', label: 'Bank IFSC', type: 'text', detail: true },
      { name: 'bankBranch', label: 'Bank Branch', type: 'text', detail: true },
      statusField(Object.values(EntityStatus).map((v) => ({ label: v, value: v }))),
      { name: 'notes', label: 'Notes', type: 'textarea', detail: true },
      { name: 'contacts', label: 'Contacts (JSON)', type: 'json', help: '[{"name":"...","designation":"...","email":"...","phone":"...","isPrimary":true}]' },
    ],
    columns: ['code', 'name', 'city', 'creditDays', 'status'],
    searchFields: ['code', 'name', 'gstin', 'city', 'email', 'contactPerson'],
    detail: true,
  },
];

export const ENTITY_INDEX: Record<string, EntityConfig> = Object.fromEntries(
  ENTITY_REGISTRY.map((e) => [e.key, e]),
);

export interface SidebarItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** required permission (read-level) to see the item */
  permission?: string;
  /** platform-level item — only visible to platform admins */
  isPlatform?: boolean;
}

export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }] },
  // Platform — platform admins only
  {
    label: 'Platform',
    items: [
      { label: 'Tenants', href: '/admin/tenants', icon: Building2, permission: 'platform:manage', isPlatform: true },
      { label: 'Subscription Plans', href: '/platform/subscriptions', icon: Package, permission: 'platform:manage', isPlatform: true },
      { label: 'Licenses', href: '/platform/licenses', icon: Lock, permission: 'platform:manage', isPlatform: true },
      { label: 'Platform Settings', href: '/platform/settings', icon: Settings2, permission: 'platform:manage', isPlatform: true },
      { label: 'System Configuration', href: '/platform/config', icon: Workflow, permission: 'platform:manage', isPlatform: true },
    ],
  },
  // Auto-generated sections from the registry (Platform and Procurement are
  // fixed sections defined explicitly below).
  ...Array.from(
    new Set(ENTITY_REGISTRY.filter((e) => e.group !== 'Procurement' && e.group !== 'Platform').map((e) => e.group)),
  ).map((group) => ({
    label: group,
    items: ENTITY_REGISTRY.filter((e) => e.group === group).map((e) => ({
      label: e.plural,
      href: `/admin/${e.key}`,
      icon: e.icon,
      permission: e.permissions.read,
      isPlatform: e.isPlatform,
    })),
  })),
  {
    label: 'Procurement',
    items: [
      { label: 'Suppliers', href: '/admin/suppliers', icon: Truck, permission: 'supplier:read' },
      { label: 'Purchase Requisitions', href: '/procurement/requisitions', icon: ClipboardList, permission: 'requisition:read' },
      { label: 'Purchase Orders', href: '/procurement/purchase-orders', icon: FileText, permission: 'purchaseorder:read' },
      { label: 'Goods Receipts', href: '/procurement/goods-receipts', icon: PackageOpen, permission: 'grn:read' },
      { label: 'Fabric Inspections', href: '/procurement/inspections', icon: ScanSearch, permission: 'inspection:read' },
      { label: 'Warehouse Receipts', href: '/procurement/warehouse-receipts', icon: Warehouse, permission: 'warehousereceipt:read' },
      { label: 'Stock', href: '/procurement/stock', icon: Package, permission: 'stock:read' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'My Tasks', href: '/tasks', icon: ClipboardList, permission: 'workflow:read' },
      { label: 'Notifications', href: '/notifications', icon: LayoutDashboard, permission: 'notification:read' },
      { label: 'Audit Log', href: '/audit', icon: Lock, permission: 'audit:read' },
      { label: 'Settings', href: '/settings', icon: Settings2, permission: 'setting:read' },
    ],
  },
];
