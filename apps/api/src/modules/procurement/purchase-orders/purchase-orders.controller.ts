import { Body, Controller, Get, Header, Param, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators';
import { ListQueryDto } from '../../../common/pagination.dto';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from './dto/purchase-order.dto';

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Get()
  @Permissions('purchaseorder:read')
  list(@Query() query: ListQueryDto) {
    return this.purchaseOrders.list(query);
  }

  @Get(':id')
  @Permissions('purchaseorder:read')
  get(@Param('id') id: string) {
    return this.purchaseOrders.getById(id);
  }

  @Get(':id/print')
  @Permissions('purchaseorder:read')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async print(@Param('id') id: string) {
    const { html } = await this.purchaseOrders.printHtml(id);
    return new StreamableFile(Buffer.from(html), { type: 'text/html; charset=utf-8' });
  }

  @Post()
  @Permissions('purchaseorder:create')
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrders.create(dto);
  }

  @Patch(':id')
  @Permissions('purchaseorder:update')
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.purchaseOrders.update(id, dto);
  }

  @Post(':id/submit')
  @Permissions('purchaseorder:approve')
  submit(@Param('id') id: string) {
    return this.purchaseOrders.submit(id);
  }

  @Post(':id/approve')
  @Permissions('purchaseorder:approve')
  approve(@Param('id') id: string) {
    return this.purchaseOrders.approve(id);
  }

  @Post(':id/reject')
  @Permissions('purchaseorder:approve')
  reject(@Param('id') id: string) {
    return this.purchaseOrders.reject(id);
  }

  @Post(':id/cancel')
  @Permissions('purchaseorder:update')
  cancel(@Param('id') id: string) {
    return this.purchaseOrders.cancel(id);
  }

  @Post(':id/archive')
  @Permissions('purchaseorder:delete')
  archive(@Param('id') id: string) {
    return this.purchaseOrders.archive(id);
  }
}
