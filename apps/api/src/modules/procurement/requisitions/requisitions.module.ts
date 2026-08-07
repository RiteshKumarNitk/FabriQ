import { Module } from '@nestjs/common';
import { WorkflowsModule } from '../../workflows/workflows.module';
import { NumberingService } from '../numbering.service';
import { RequisitionsService } from './requisitions.service';
import { RequisitionsController } from './requisitions.controller';

@Module({
  imports: [WorkflowsModule],
  controllers: [RequisitionsController],
  providers: [RequisitionsService, NumberingService],
  exports: [RequisitionsService],
})
export class RequisitionsModule {}
