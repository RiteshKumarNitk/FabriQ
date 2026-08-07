import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators';
import { ListQueryDto } from '../../../common/pagination.dto';
import { WarehouseReceiptsService } from './warehouse-receipts.service';
import { CreateWarehouseReceiptDto, UpdateWarehouseReceiptDto } from './dto/warehouse-receipt.dto';

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('warehouse-receipts')
export class WarehouseReceiptsController {
  constructor(private readonly warehouseReceipts: WarehouseReceiptsService) {}

  @Get()
  @Permissions('warehousereceipt:read')
  list(@Query() query: ListQueryDto) {
    return this.warehouseReceipts.list(query);
  }

  @Get('approved-rolls')
  @Permissions('warehousereceipt:read')
  approvedRolls() {
    return this.warehouseReceipts.approvedRolls();
  }

  @Get(':id')
  @Permissions('warehousereceipt:read')
  get(@Param('id') id: string) {
    return this.warehouseReceipts.getById(id);
  }

  @Post()
  @Permissions('warehousereceipt:create')
  create(@Body() dto: CreateWarehouseReceiptDto) {
    return this.warehouseReceipts.create(dto);
  }

  @Patch(':id')
  @Permissions('warehousereceipt:update')
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseReceiptDto) {
    return this.warehouseReceipts.update(id, dto);
  }

  @Post(':id/archive')
  @Permissions('warehousereceipt:delete')
  archive(@Param('id') id: string) {
    return this.warehouseReceipts.archive(id);
  }
}
