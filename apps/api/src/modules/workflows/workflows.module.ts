import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
