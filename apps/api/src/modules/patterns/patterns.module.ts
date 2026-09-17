import { Module } from '@nestjs/common';
import { PatternsService } from './patterns.service';
import { PatternsController } from './patterns.controller';
import { NumberingService } from '../procurement/numbering.service';

@Module({
  imports: [],
  controllers: [PatternsController],
  providers: [PatternsService, NumberingService],
  exports: [PatternsService],
})
export class PatternsModule {}
