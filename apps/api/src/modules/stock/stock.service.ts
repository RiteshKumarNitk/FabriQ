import { Injectable } from '@nestjs/common';
import { StockTransactionType } from '@fabriq/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ListQueryDto } from '../../common/pagination.dto';
import { buildListArgs, buildPaginationMeta } from '../../common/list-args';

/**
 * Minimal stock layer for the Phase 2 hand-off: a transaction journal and a
 * computed balance view. Inventory (roll master, transfers, adjustments,
 * negative-stock rules) is Phase 3 — this is deliberately thin.
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async transactions(dto: ListQueryDto) {
    const args = buildListArgs(dto, {
      searchFields: ['itemName', 'batch', 'lot', 'number'],
      where: {},
      defaultSortBy: 'createdOn',
    });
    const [items, total] = await Promise.all([
      this.prisma.client.stockTransaction.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        include: { warehouse: { select: { id: true, code: true, name: true } } },
      }),
      this.prisma.client.stockTransaction.count({ where: args.where }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }

  /** Running balance per (warehouse, item, unit): Σ IN − Σ OUT. */
  async balances() {
    const [ins, outs] = await Promise.all([
      this.prisma.client.stockTransaction.groupBy({
        by: ['warehouseId', 'itemName', 'unit'],
        where: { transactionType: StockTransactionType.IN },
        _sum: { quantity: true },
      }),
      this.prisma.client.stockTransaction.groupBy({
        by: ['warehouseId', 'itemName', 'unit'],
        where: { transactionType: StockTransactionType.OUT },
        _sum: { quantity: true },
      }),
    ]);
    const outMap = new Map(
      outs.map((o: any) => [`${o.warehouseId}|${o.itemName}|${o.unit}`, Number(o._sum.quantity ?? 0)]),
    );
    return ins.map((row: any) => {
      const key = `${row.warehouseId}|${row.itemName}|${row.unit}`;
      const out = outMap.get(key) ?? 0;
      const quantityIn = Number(row._sum.quantity ?? 0);
      return {
        warehouseId: row.warehouseId,
        itemName: row.itemName,
        unit: row.unit,
        quantityIn,
        quantityOut: out,
        balance: quantityIn - out,
      };
    });
  }
}
