import { Module } from '@nestjs/common';
import { SuppliersModule } from './suppliers/suppliers.module';
import { RequisitionsModule } from './requisitions/requisitions.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { GoodsReceiptsModule } from './goods-receipts/goods-receipts.module';
import { InspectionsModule } from './inspections/inspections.module';
import { WarehouseReceiptsModule } from './warehouse-receipts/warehouse-receipts.module';

/**
 * Phase 2 — Procurement. Aggregates the complete purchasing lifecycle:
 * Supplier → Purchase Requisition → Purchase Order → Goods Receipt →
 * Fabric Inspection → Warehouse Receipt. Stock (transactions + balances)
 * lives in its own module as the Inventory hand-off point.
 */
@Module({
  imports: [
    SuppliersModule,
    RequisitionsModule,
    PurchaseOrdersModule,
    GoodsReceiptsModule,
    InspectionsModule,
    WarehouseReceiptsModule,
  ],
})
export class ProcurementModule {}
