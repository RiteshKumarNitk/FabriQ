import { Module } from '@nestjs/common';
import { WorkflowsModule } from '../../workflows/workflows.module';
import { NumberingService } from '../numbering.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';

@Module({
  imports: [WorkflowsModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, NumberingService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
