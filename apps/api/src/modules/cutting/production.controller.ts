import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ProductionService } from './production.service';

@ApiTags('cutting')
@ApiBearerAuth()
@Controller()
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  // ── Cut orders ──────────────────────────────────────────────────────────

  @Get('cut-orders')
  @Permissions('cutorder:read')
  listCutOrders(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('filters') filters?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.production.listCutOrders({
      search,
      status,
      filters,
      sortBy,
      sortOrder,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('cut-orders/:id')
  @Permissions('cutorder:read')
  getCutOrder(@Param('id') id: string) {
    return this.production.getCutOrder(id);
  }

  @Post('cut-orders')
  @Permissions('cutorder:create')
  createCutOrder(
    @Body()
    dto: {
      number?: string;
      styleRef?: string;
      color?: string;
      fabricType?: string;
      required: Record<string, number>;
      notes?: string;
    },
  ) {
    return this.production.createCutOrder(dto);
  }

  @Patch('cut-orders/:id')
  @Permissions('cutorder:update')
  updateCutOrder(
    @Param('id') id: string,
    @Body()
    dto: {
      styleRef?: string;
      color?: string;
      fabricType?: string;
      required?: Record<string, number>;
      notes?: string;
      status?: string;
    },
  ) {
    return this.production.updateCutOrder(id, dto);
  }

  @Post('cut-orders/:id/approve')
  @Permissions('cutorder:update')
  approveCutOrder(@Param('id') id: string) {
    return this.production.approveCutOrder(id);
  }

  @Post('cut-orders/:id/archive')
  @Permissions('cutorder:delete')
  archiveCutOrder(@Param('id') id: string) {
    return this.production.archiveCutOrder(id);
  }

  // ── Lay plans ───────────────────────────────────────────────────────────

  @Get('lay-plans')
  @Permissions('cutorder:read')
  listLayPlans(
    @Query('cutOrderId') cutOrderId?: string,
    @Query('rollId') rollId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.production.listLayPlans({
      cutOrderId,
      rollId,
      status,
      search,
      sortBy,
      sortOrder,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('lay-plans/:id')
  @Permissions('cutorder:read')
  getLayPlan(@Param('id') id: string) {
    return this.production.getLayPlan(id);
  }

  @Get('fabric-rolls/:rollId/available-slots')
  @Permissions('cutorder:read')
  availableSlots(@Param('rollId') rollId: string, @Query('markerLengthCm') markerLengthCm?: string) {
    return this.production.availableSlots(rollId, markerLengthCm ? Number(markerLengthCm) : undefined);
  }

  @Post('lay-plans')
  @Permissions('cutorder:create')
  createLayPlan(
    @Body()
    dto: {
      markerId: string;
      rollId: string;
      ply: number;
      cutOrderId?: string;
      markerStartCm?: number;
      allowDefectOverlap?: boolean;
      notes?: string;
    },
  ) {
    return this.production.createLayPlan(dto);
  }

  @Post('lay-plans/:id/cancel')
  @Permissions('cutorder:update')
  cancelLayPlan(@Param('id') id: string) {
    return this.production.cancelLayPlan(id);
  }

  // ── Cut operations ──────────────────────────────────────────────────────

  @Get('cut-operations')
  @Permissions('cutorder:read')
  listCutOperations(
    @Query('layPlanId') layPlanId?: string,
    @Query('rollId') rollId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.production.listCutOperations({
      layPlanId,
      rollId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post('lay-plans/:id/complete-cutting')
  @Permissions('cutorder:update')
  completeCutting(
    @Param('id') id: string,
    @Body()
    dto: {
      actualLengthCm: number;
      actualPieces: number;
      rejectedPieces?: number;
      wasteLengthCm?: number;
      notes?: string;
    },
  ) {
    return this.production.completeCutOperation(id, dto);
  }
}
