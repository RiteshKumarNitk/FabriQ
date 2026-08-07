import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators';
import { ListQueryDto } from '../../../common/pagination.dto';
import { GoodsReceiptsService } from './goods-receipts.service';
import { CreateGoodsReceiptDto, UpdateGoodsReceiptDto } from './dto/goods-receipt.dto';

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('goods-receipts')
export class GoodsReceiptsController {
  constructor(private readonly goodsReceipts: GoodsReceiptsService) {}

  @Get()
  @Permissions('grn:read')
  list(@Query() query: ListQueryDto) {
    return this.goodsReceipts.list(query);
  }

  @Get(':id')
  @Permissions('grn:read')
  get(@Param('id') id: string) {
    return this.goodsReceipts.getById(id);
  }

  @Post()
  @Permissions('grn:create')
  create(@Body() dto: CreateGoodsReceiptDto) {
    return this.goodsReceipts.create(dto);
  }

  @Patch(':id')
  @Permissions('grn:update')
  update(@Param('id') id: string, @Body() dto: UpdateGoodsReceiptDto) {
    return this.goodsReceipts.update(id, dto);
  }

  @Post(':id/confirm')
  @Permissions('grn:update')
  confirm(@Param('id') id: string) {
    return this.goodsReceipts.confirm(id);
  }

  @Post(':id/cancel')
  @Permissions('grn:update')
  cancel(@Param('id') id: string) {
    return this.goodsReceipts.cancel(id);
  }

  @Post(':id/archive')
  @Permissions('grn:delete')
  archive(@Param('id') id: string) {
    return this.goodsReceipts.archive(id);
  }
}
