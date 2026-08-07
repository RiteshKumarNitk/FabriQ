import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators';
import { ListQueryDto } from '../../../common/pagination.dto';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @Permissions('supplier:read')
  list(@Query() query: ListQueryDto) {
    return this.suppliers.list(query);
  }

  @Get(':id')
  @Permissions('supplier:read')
  get(@Param('id') id: string) {
    return this.suppliers.getById(id);
  }

  @Post()
  @Permissions('supplier:create')
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }

  @Patch(':id')
  @Permissions('supplier:update')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(id, dto);
  }

  @Post(':id/archive')
  @Permissions('supplier:delete')
  archive(@Param('id') id: string) {
    return this.suppliers.archive(id);
  }
}
