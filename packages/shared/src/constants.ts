/**
 * System role codes. Roles are tenant-scoped (except PLATFORM_ADMIN which is
 * platform-scoped). Codes must never change — they are referenced by the
 * workflow engine and by seed data.
 */
export const ROLE_CODES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  TENANT_ADMIN: 'TENANT_ADMIN',
  FACTORY_MANAGER: 'FACTORY_MANAGER',
  SUPERVISOR: 'SUPERVISOR',
  OPERATOR: 'OPERATOR',
  VIEWER: 'VIEWER',
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

/** Default settings seeded per tenant. Keys are the single source of truth. */
export const DEFAULT_TENANT_SETTINGS: Record<string, string | number | boolean> = {
  'general.timezone': 'Asia/Kolkata',
  'general.locale': 'en-IN',
  'general.currency': 'INR',
  'general.dateFormat': 'DD/MM/YYYY',
  'production.shiftCount': 2,
  'production.bundleSize': 40,
  'quality.defaultInspectionLevel': 'AQL_II',
  'inventory.allowNegativeStock': false,
  'inventory.defaultUnit': 'METERS',
};

/** Request context injected into every authenticated API call. */
export interface RequestContext {
  userId: string;
  tenantId: string | null;
  companyId: string | null;
  factoryId: string | null;
  roles: string[];
  permissions: string[];
  isPlatformAdmin: boolean;
  ip?: string;
  userAgent?: string;
}

/** Audit stamping helpers applied to every mutable business record. */
export interface AuditFields {
  createdBy: string | null;
  updatedBy: string | null;
}
