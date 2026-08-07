# Phase 2 — Procurement Module

The first business module of the garment manufacturing ERP. It manages the complete
purchasing lifecycle of raw materials (primarily fabric) — from supplier registration
until approved fabric reaches the warehouse.

```
Supplier Management → Purchase Requisition → Purchase Order → Goods Receipt Note
    → Fabric Inspection (4-point) → Warehouse Receipt  ⇢  (Phase 3: Inventory)
```

Only after Warehouse Receipt does the Inventory module begin. Every document carries
tenant scoping, audit columns, soft delete, comments, attachments and an activity
timeline via the Phase 1 frameworks — no architectural changes were required.

---

## 1. Business Analysis

| Concern | Decision |
|---|---|
| Document identity | Sequential per-tenant numbers (`PR-2026-0001`, `PO-…`, `GRN-…`, `INSP-…`, `WR-…`) from a `DocumentSequence` counter — atomic, race-safe, never reused. |
| Requisition → PO | Approved requisitions convert into draft POs, copying line items with a link back (`requisitionItemId`) for traceability. |
| Partial delivery | A PO can have many GRNs; each PO line tracks `receivedQty` derived from the **GOOD** rolls received against it. Damaged rolls never count toward receipt. |
| Roll identity | Every physical roll is a first-class record (roll number, fabric, color, GSM, width, length, weight, batch, lot, barcode/QR) that moves through statuses: `PENDING_INSPECTION → APPROVED / SECOND_QUALITY / REJECTED → RECEIVED_IN_WAREHOUSE`. |
| Grading | Industry-standard **4-point system**: each defect 1–4 points, normalized **per 100 linear meters**; ≤ 15 pts/100 m → approved, ≤ 30 → second quality, above → rejected. Quality score = max(0, 100 − pts/100 m). |
| Stock hand-off | Warehouse Receipt posts an `IN` `StockTransaction` (the traceable journal). Balances are computed from the journal; full inventory is Phase 3. |
| Approvals | Requisitions route through the generic workflow engine (seeded `PR-APPROVAL` definition: supervisor → factory manager). POs route through the engine when a definition exists, otherwise through direct manager approve/reject. |
| YAGNI | No supplier abstraction, no item master, no inventory ledger — the minimal surface Inventory needs later. |

## 2. Database Design

New tables (all tenant-scoped, all with the standard audit columns on headers):

| Table | Purpose |
|---|---|
| `DocumentSequence` | Per-tenant, per-prefix, per-year counters for document numbers. |
| `Supplier` | Master vendor record (trading, bank, contacts JSON). |
| `PurchaseRequisition` / `PurchaseRequisitionItem` | Request header + lines. |
| `PurchaseOrder` / `PurchaseOrderItem` | Order header (tax/discount/totals) + lines with `receivedQty`. |
| `GoodsReceiptNote` / `GrnRoll` | Delivery header + roll-level capture. |
| `FabricInspection` / `FabricInspectionDefect` | One inspection per roll + 1–4 point defects. |
| `WarehouseReceipt` | Roll → warehouse/bin placement (one per roll). |
| `StockTransaction` | Minimal IN/OUT/ADJUSTMENT journal (Phase 3 hand-off). |

Relationships: `Supplier 1—N PurchaseOrder 1—N GoodsReceiptNote 1—N GrnRoll
1—1 FabricInspection`; `GrnRoll N—1 PurchaseOrderItem`; `GrnRoll 1—1 WarehouseReceipt
1—N StockTransaction (refEntityType='warehouse-receipt')`.

## 3. Prisma Models

`packages/database/prisma/schema.prisma` → `PHASE 2 — PROCUREMENT` section.
Enums: `Priority`, `RequisitionStatus`, `PurchaseOrderStatus`, `GrnStatus`,
`RollCondition`, `GrnRollStatus`, `InspectionDecision`, `StockTransactionType`, `Unit`.
All new models are registered in `TENANT_SCOPED_MODELS`
(`packages/database/src/client.ts`).

> **Write-path note:** the tenant-scoped Prisma extension (`$extends`) safely injects
> `tenantId` for scalar-only operations. Document writes that mix scalar foreign keys
> with nested relation creates use the **raw client with an explicit `tenantId`**
> (same convention as the workflow engine) — this avoids Prisma's checked-input variant
> rejecting scalar FKs / extension-injected `tenantId`.

## 4. NestJS APIs

All under `apps/api/src/modules/procurement/`, prefix `/api/v1`:

| Endpoints | Notes |
|---|---|
| `GET/POST /suppliers`, `GET/PATCH /suppliers/:id`, `POST /suppliers/:id/archive` | Entity-style CRUD (search over code/name/GSTIN/city/email). |
| `GET/POST /requisitions`, `GET/PATCH /requisitions/:id`, `POST /requisitions/:id/submit` `…/cancel` `…/convert` `…/archive` | `submit` starts the PR-APPROVAL workflow; `convert` (approved only) creates a draft PO. |
| `GET/POST /purchase-orders`, `GET/PATCH /purchase-orders/:id`, `POST …/submit` `…/approve` `…/reject` `…/cancel` `…/archive`, `GET …/:id/print` | Server-side totals; `print` returns print-ready HTML (browser Print → Save as PDF). |
| `GET/POST /goods-receipts`, `GET/PATCH /goods-receipts/:id`, `POST …/confirm` `…/cancel` `…/archive` | Roll capture, duplicate roll-number guard, PO `receivedQty`/status recalculation. |
| `GET/POST /inspections`, `GET/PATCH /inspections/:id`, `POST …/archive`, `GET /inspections/pending-rolls` | 4-point grading; updates the roll status. |
| `GET/POST /warehouse-receipts`, `GET/PATCH /warehouse-receipts/:id`, `POST …/archive`, `GET /warehouse-receipts/approved-rolls` | Only approved/second-quality rolls; posts the stock transaction. |
| `GET /stock/transactions`, `GET /stock/balances` | Journal + computed balances (stock:read). |

Every route is RBAC-gated (`@Permissions`) and flows through the standard pipeline
(guards, validation, audit interceptor, response envelope).

## 5. Validation Rules

- **Supplier:** `code ^[A-Z0-9_-]+$`; email format; `creditDays ≥ 0`; status ∈ `ACTIVE/INACTIVE`.
- **Requisition:** ≥ 1 item; `quantity > 0`; editable only in `DRAFT`; submit only from `DRAFT/REJECTED`; convert only from `APPROVED`; archive only `DRAFT`.
- **Purchase Order:** supplier required; ≥ 1 item; `rate ≥ 0`, `quantity > 0`; `tax/discount ∈ [0,100]`; status machine: `DRAFT → SUBMITTED → APPROVED → (PARTIALLY_RECEIVED | COMPLETED) | CANCELLED`; edit only `DRAFT`.
- **Goods Receipt:** PO required; ≥ 1 roll; roll numbers unique per GRN; roll line references must belong to the PO; confirm only `DRAFT` with rolls.
- **Inspection:** roll must be uninspected; defect points 1–4; one inspection per roll.
- **Warehouse Receipt:** roll must be `APPROVED`/`SECOND_QUALITY` and not already received; warehouse required; one receipt per roll.

## 6. Frontend Pages

| Route | Content |
|---|---|
| `/admin/suppliers` | Generic entity CRUD (search, filters, status, detail with activity/comments/attachments). |
| `/procurement/requisitions` (+ `new`, `[id]`) | List with status filter; line-item editor; detail with submit/cancel/convert actions and approval tab. |
| `/procurement/purchase-orders` (+ `new`, `[id]`) | Priced line editor with live totals; print; receipts history; receive-progress bars. |
| `/procurement/goods-receipts` (+ `new`, `[id]`) | Roll-level capture editor; per-roll Inspect/Receive action routing. |
| `/procurement/inspections` (+ `new`, `[id]`) | Defect editor with **live 4-point grade** (points, pts/100 m, score, decision). |
| `/procurement/warehouse-receipts` (+ `new`, `[id]`) | Approved-roll picker + location assignment; traceability view. |
| `/procurement/stock` | Balances + transaction journal. |
| Dashboard | New Procurement KPI row (suppliers, open requisitions/POs, rolls awaiting inspection). |

## 7. Permission Matrix

| Permission | Tenant Admin | Factory Manager | Supervisor | Operator | Viewer |
|---|---|---|---|---|---|
| `supplier:*` | all | all | read | read | read |
| `requisition:*` | all | all (+approve) | read/create/update | read | read |
| `purchaseorder:*` | all | all (+approve) | read | read | read |
| `grn:*` | all | all | read/create/update | read | read |
| `inspection:*` | all | all | read/create/update | read | read |
| `warehousereceipt:*` | all | all | read | read | read |
| `stock:read` | yes | yes | yes | yes | yes |

Single source of truth: `packages/shared/src/permissions.ts` + `TENANT_ROLE_PERMISSION_MATRIX`
(`packages/database/src/tenant-provision.ts`). New permissions are picked up on the
next login (JWTs are minted at login; 15-minute expiry self-heals sessions).

## 8. Workflow

```
Requisition:  DRAFT ─submit→ SUBMITTED ─workflow(supervisor→manager)─> APPROVED ─convert→ PO(DRAFT)
                                                                        └ REJECTED ─edit→ DRAFT
PO:           DRAFT ─submit→ SUBMITTED ─approve→ APPROVED ─GRN→ PARTIALLY_RECEIVED → COMPLETED
                                                              └ CANCELLED
Roll:         PENDING_INSPECTION ─inspect→ APPROVED / SECOND_QUALITY / REJECTED
              APPROVED/SECOND_QUALITY ─warehouse receipt→ RECEIVED_IN_WAREHOUSE
```

Approval progress is visible on document details (Approval tab reads the generic
workflow instances). The PO `receivedQty`/status recalculation is triggered from the
goods-receipts service after every GRN save/cancel.

## 9. Acceptance Criteria

1. A tenant user can register a supplier and search/filter/export it.
2. Creating a requisition with line items produces `PR-YYYY-NNNN`; editing is blocked once submitted.
3. Submitting starts the approval workflow; after both steps approve, the requisition reads `APPROVED` (lazy sync on read).
4. An approved requisition converts to a draft PO carrying its items; the requisition becomes `CONVERTED`.
5. PO totals (subtotal, tax, discount, grand total) are computed server-side; the PO prints to a clean HTML document.
6. A GRN with rolls — including a damaged roll — leaves the PO `PARTIALLY_RECEIVED` with `receivedQty` counting only GOOD roll length.
7. Inspecting a clean roll grades 100 → APPROVED; a roll at >30 pts/100 m grades REJECTED and its status updates; the GRN progress bar reflects decisions.
8. Only approved/second-quality rolls appear in the warehouse-receipt picker; receiving posts one `IN` stock transaction and the balance view shows it.
9. Every mutation appears in the document's Activity tab and is tenant-isolated; archived documents are soft-deleted only.
