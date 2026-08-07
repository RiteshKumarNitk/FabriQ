import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/pagination.dto';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';

@ApiTags('organization')
@ApiBearerAuth()
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  @Permissions('warehouse:read')
  list(@Query() query: ListQueryDto) {
    return this.warehouses.list(query);
  }

  @Get(':id')
  @Permissions('warehouse:read')
  get(@Param('id') id: string) {
    return this.warehouses.getById(id);
  }

  @Post()
  @Permissions('warehouse:create')
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehouses.create(dto);
  }

  @Patch(':id')
  @Permissions('warehouse:update')
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehouses.update(id, dto);
  }

  @Post(':id/archive')
  @Permissions('warehouse:delete')
  archive(@Param('id') id: string) {
    return this.warehouses.archive(id);
  }
}
