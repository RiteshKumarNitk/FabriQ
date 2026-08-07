import { Module } from '@nestjs/common';
import { NumberingService } from '../numbering.service';
import { WarehouseReceiptsService } from './warehouse-receipts.service';
import { WarehouseReceiptsController } from './warehouse-receipts.controller';

@Module({
  controllers: [WarehouseReceiptsController],
  providers: [WarehouseReceiptsService, NumberingService],
  exports: [WarehouseReceiptsService],
})
export class WarehouseReceiptsModule {}
