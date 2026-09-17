import { Module } from '@nestjs/common';
import { NumberingService } from '../numbering.service';
import { WarehouseReceiptsService } from './warehouse-receipts.service';
import { WarehouseReceiptsController } from './warehouse-receipts.controller';
import { FabricRollsService } from '../../cutting/fabric-rolls.service';

/**
 * FabricRollsService is registered directly (PrismaModule is global and the
 * service is stateless) so warehouse receipts can auto-create cutting rolls
 * without importing CuttingModule, which itself imports ProcurementModule —
 * that would create a module cycle.
 */
@Module({
  controllers: [WarehouseReceiptsController],
  providers: [WarehouseReceiptsService, NumberingService, FabricRollsService],
  exports: [WarehouseReceiptsService],
})
export class WarehouseReceiptsModule {}
