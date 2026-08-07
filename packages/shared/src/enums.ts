/**
 * Domain enums — the single source of truth for every status / type used
 * across the platform. Never define these literals inline in services or UI.
 */

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  LOCKED = 'LOCKED',
  PENDING = 'PENDING',
}

export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ONBOARDING = 'ONBOARDING',
  CLOSED = 'CLOSED',
}

export enum EntityStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum WarehouseType {
  RAW_MATERIAL = 'RAW_MATERIAL',
  WIP = 'WIP',
  FINISHED_GOODS = 'FINISHED_GOODS',
  RETURNS = 'RETURNS',
}

export enum ProductionLineStatus {
  ACTIVE = 'ACTIVE',
  IDLE = 'IDLE',
  MAINTENANCE = 'MAINTENANCE',
  CLOSED = 'CLOSED',
}

export enum NotificationType {
  TASK = 'TASK',
  APPROVAL = 'APPROVAL',
  SYSTEM = 'SYSTEM',
  DOCUMENT = 'DOCUMENT',
}

export enum WorkflowStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum WorkflowTaskStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ESCALATED = 'ESCALATED',
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  ARCHIVE = 'ARCHIVE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  UPLOAD = 'UPLOAD',
  DOWNLOAD = 'DOWNLOAD',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  EXPORT = 'EXPORT',
}

export enum SettingScope {
  PLATFORM = 'PLATFORM',
  TENANT = 'TENANT',
}

export enum DocumentCategory {
  GENERAL = 'GENERAL',
  CONTRACT = 'CONTRACT',
  INVOICE = 'INVOICE',
  CERTIFICATE = 'CERTIFICATE',
  TECHNICAL = 'TECHNICAL',
}

// ── Phase 2 — Procurement ────────────────────────────────────────────────

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum RequisitionStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  CONVERTED = 'CONVERTED',
}

export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum GrnStatus {
  DRAFT = 'DRAFT',
  RECEIVED = 'RECEIVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum RollCondition {
  GOOD = 'GOOD',
  DAMAGED = 'DAMAGED',
}

export enum GrnRollStatus {
  PENDING_INSPECTION = 'PENDING_INSPECTION',
  APPROVED = 'APPROVED',
  SECOND_QUALITY = 'SECOND_QUALITY',
  REJECTED = 'REJECTED',
  RECEIVED_IN_WAREHOUSE = 'RECEIVED_IN_WAREHOUSE',
}

export enum InspectionDecision {
  APPROVED = 'APPROVED',
  SECOND_QUALITY = 'SECOND_QUALITY',
  REJECTED = 'REJECTED',
}

export enum StockTransactionType {
  IN = 'IN',
  OUT = 'OUT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum Unit {
  METERS = 'METERS',
  KILOGRAMS = 'KILOGRAMS',
  ROLLS = 'ROLLS',
  PIECES = 'PIECES',
  DOZENS = 'DOZENS',
  LITERS = 'LITERS',
}
