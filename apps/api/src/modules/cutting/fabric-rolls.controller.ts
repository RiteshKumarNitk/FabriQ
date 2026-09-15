import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { FabricRollsService } from './fabric-rolls.service';
import {
  AddMeasurementDto,
  AdjustmentDto,
  CreateDefectDto,
  CreateFabricRollDto,
  UpdateDefectDto,
  UpdateFabricRollDto,
} from './dto/fabric-roll.dto';

@ApiTags('cutting')
@ApiBearerAuth()
@Controller('fabric-rolls')
export class FabricRollsController {
  constructor(private readonly rolls: FabricRollsService) {}

  @Get()
  @Permissions('roll:read')
  list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.rolls.list({
      search,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @Permissions('roll:read')
  get(@Param('id') id: string) {
    return this.rolls.getById(id);
  }

  @Get(':id/summary')
  @Permissions('roll:read')
  summary(@Param('id') id: string) {
    return this.rolls.summary(id);
  }

  @Post()
  @Permissions('roll:create')
  create(@Body() dto: CreateFabricRollDto) {
    return this.rolls.create(dto);
  }

  @Patch(':id')
  @Permissions('roll:update')
  update(@Param('id') id: string, @Body() dto: UpdateFabricRollDto) {
    return this.rolls.update(id, dto);
  }

  @Post(':id/archive')
  @Permissions('roll:delete')
  archive(@Param('id') id: string) {
    return this.rolls.archive(id);
  }

  @Post(':id/measurements')
  @Permissions('roll:update')
  addMeasurement(@Param('id') id: string, @Body() dto: AddMeasurementDto) {
    return this.rolls.addMeasurement(id, dto);
  }

  @Post(':id/defects')
  @Permissions('roll:update')
  addDefect(@Param('id') id: string, @Body() dto: CreateDefectDto) {
    return this.rolls.addDefect(id, dto);
  }

  @Patch(':id/defects/:defectId')
  @Permissions('roll:update')
  updateDefect(@Param('id') id: string, @Param('defectId') defectId: string, @Body() dto: UpdateDefectDto) {
    return this.rolls.updateDefect(id, defectId, dto);
  }

  @Post(':id/defects/:defectId/archive')
  @Permissions('roll:update')
  archiveDefect(@Param('id') id: string, @Param('defectId') defectId: string) {
    return this.rolls.archiveDefect(id, defectId);
  }

  @Post(':id/adjustments')
  @Permissions('roll:update')
  adjust(@Param('id') id: string, @Body() dto: AdjustmentDto) {
    return this.rolls.adjust(id, dto);
  }
}
