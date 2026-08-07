import { Module } from '@nestjs/common';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { NumberingService } from '../numbering.service';
import { GoodsReceiptsService } from './goods-receipts.service';
import { GoodsReceiptsController } from './goods-receipts.controller';

@Module({
  imports: [PurchaseOrdersModule],
  controllers: [GoodsReceiptsController],
  providers: [GoodsReceiptsService, NumberingService],
  exports: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
