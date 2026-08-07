import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators';
import { ListQueryDto } from '../../../common/pagination.dto';
import { InspectionsService } from './inspections.service';
import { CreateInspectionDto, UpdateInspectionDto } from './dto/inspection.dto';

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('inspections')
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get()
  @Permissions('inspection:read')
  list(@Query() query: ListQueryDto) {
    return this.inspections.list(query);
  }

  @Get('pending-rolls')
  @Permissions('inspection:read')
  pendingRolls() {
    return this.inspections.pendingRolls();
  }

  @Get(':id')
  @Permissions('inspection:read')
  get(@Param('id') id: string) {
    return this.inspections.getById(id);
  }

  @Post()
  @Permissions('inspection:create')
  create(@Body() dto: CreateInspectionDto) {
    return this.inspections.create(dto);
  }

  @Patch(':id')
  @Permissions('inspection:update')
  update(@Param('id') id: string, @Body() dto: UpdateInspectionDto) {
    return this.inspections.update(id, dto);
  }

  @Post(':id/archive')
  @Permissions('inspection:delete')
  archive(@Param('id') id: string) {
    return this.inspections.archive(id);
  }
}
