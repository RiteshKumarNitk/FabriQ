import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators';
import { ListQueryDto } from '../../../common/pagination.dto';
import { RequisitionsService } from './requisitions.service';
import {
  ConvertRequisitionDto,
  CreateRequisitionDto,
  UpdateRequisitionDto,
} from './dto/requisition.dto';

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('requisitions')
export class RequisitionsController {
  constructor(private readonly requisitions: RequisitionsService) {}

  @Get()
  @Permissions('requisition:read')
  list(@Query() query: ListQueryDto) {
    return this.requisitions.list(query);
  }

  @Get(':id')
  @Permissions('requisition:read')
  get(@Param('id') id: string) {
    return this.requisitions.getById(id);
  }

  @Post()
  @Permissions('requisition:create')
  create(@Body() dto: CreateRequisitionDto) {
    return this.requisitions.create(dto);
  }

  @Patch(':id')
  @Permissions('requisition:update')
  update(@Param('id') id: string, @Body() dto: UpdateRequisitionDto) {
    return this.requisitions.update(id, dto);
  }

  @Post(':id/submit')
  @Permissions('requisition:approve')
  submit(@Param('id') id: string) {
    return this.requisitions.submit(id);
  }

  @Post(':id/cancel')
  @Permissions('requisition:update')
  cancel(@Param('id') id: string) {
    return this.requisitions.cancel(id);
  }

  @Post(':id/convert')
  @Permissions('requisition:approve')
  convert(@Param('id') id: string, @Body() dto: ConvertRequisitionDto) {
    return this.requisitions.convert(id, dto);
  }

  @Post(':id/archive')
  @Permissions('requisition:delete')
  archive(@Param('id') id: string) {
    return this.requisitions.archive(id);
  }
}
