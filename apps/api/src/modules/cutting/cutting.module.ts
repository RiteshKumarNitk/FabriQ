import { Module } from '@nestjs/common';
import { FabricRollsService } from './fabric-rolls.service';
import { FabricRollsController } from './fabric-rolls.controller';
import { MarkersService } from './markers.service';
import { MarkersController } from './markers.controller';
import { ProductionService } from './production.service';
import { ProductionController } from './production.controller';
import { NumberingService } from '../procurement/numbering.service';
import { ProcurementModule } from '../procurement/procurement.module';

/**
 * Phase 3 — Cutting Room. Fabric rolls + measurement + defects + marker
 * planning + lay planning + cutting + material ledger. Shares the
 * NumberingService with procurement for per-tenant document numbers.
 */
@Module({
  imports: [ProcurementModule],
  controllers: [FabricRollsController, MarkersController, ProductionController],
  providers: [FabricRollsService, MarkersService, ProductionService, NumberingService],
  exports: [FabricRollsService],
})
export class CuttingModule {}
