import { Module } from '@nestjs/common';
import { NumberingService } from '../numbering.service';
import { InspectionsService } from './inspections.service';
import { InspectionsController } from './inspections.controller';

@Module({
  controllers: [InspectionsController],
  providers: [InspectionsService, NumberingService],
  exports: [InspectionsService],
})
export class InspectionsModule {}
