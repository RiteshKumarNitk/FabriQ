import { Module } from '@nestjs/common';
import { FabricsService } from './fabrics.service';
import { FabricsController } from './fabrics.controller';

@Module({
  controllers: [FabricsController],
  providers: [FabricsService],
  exports: [FabricsService],
})
export class FabricsModule {}
