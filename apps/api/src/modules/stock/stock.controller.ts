import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/pagination.dto';
import { StockService } from './stock.service';

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('transactions')
  @Permissions('stock:read')
  transactions(@Query() query: ListQueryDto) {
    return this.stock.transactions(query);
  }

  @Get('balances')
  @Permissions('stock:read')
  balances() {
    return this.stock.balances();
  }
}
