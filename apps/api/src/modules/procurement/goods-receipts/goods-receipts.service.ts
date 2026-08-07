import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getRequestContext } from '@fabriq/database';
import { PrismaService } from '../../../prisma/prisma.service';
import { ListQueryDto } from '../../../common/pagination.dto';
import { buildListArgs, buildPaginationMeta } from '../../../common/list-args';
import { NumberingService } from '../numbering.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { CreateGoodsReceiptDto, UpdateGoodsReceiptDto } from './dto/goods-receipt.dto';

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly purchaseOrders: PurchaseOrdersService,
  ) {}

  async list(dto: ListQueryDto) {
    const args = buildListArgs(dto, {
      searchFields: ['number', 'invoiceNumber', 'vehicleNumber'],
      where: { isDeleted: false },
      defaultSortBy: 'createdOn',
    });
    const [items, total] = await Promise.all([
      this.prisma.client.goodsReceiptNote.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        include: {
          purchaseOrder: { select: { id: true, number: true } },
          supplier: { select: { id: true, code: true, name: true } },
          _count: { select: { rolls: true } },
        },
      }),
      this.prisma.client.goodsReceiptNote.count({ where: args.where }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }

  async getById(id: string) {
    const doc = await this.fetchById(id);
    // derived inspection progress
    const totalRolls = doc.rolls.length;
    const decided = doc.rolls.filter(
      (r: any) => r.status !== 'PENDING_INSPECTION',
    ).length;
    return {
      ...doc,
      progress: totalRolls === 0 ? 0 : Math.round((decided / totalRolls) * 100),
      rollsInspected: decided,
      rollsTotal: totalRolls,
    };
  }

  private async fetchById(id: string) {
    const doc = await this.prisma.client.goodsReceiptNote.findFirst({
      where: { id, isDeleted: false },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            number: true,
            status: true,
            supplier: { select: { id: true, name: true } },
            items: { select: { id: true, itemName: true, unit: true, quantity: true } },
          },
        },
        supplier: true,
        rolls: {
          orderBy: { createdOn: 'asc' },
          include: {
            inspection: { select: { id: true, decision: true, qualityScore: true, totalPoints: true } },
            warehouseReceipts: { select: { id: true, number: true } },
          },
        },
      },
    });
    if (!doc) throw new NotFoundException('Goods receipt note not found');
    return doc;
  }

  async create(dto: CreateGoodsReceiptDto) {
    this.validateRolls(dto.rolls);
    const po = await this.prisma.client.purchaseOrder.findFirst({
      where: { id: dto.purchaseOrderId, isDeleted: false },
      include: { items: { select: { id: true, unit: true } } },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    const itemIds = new Set(po.items.map((i) => i.id));
    for (const roll of dto.rolls) {
      if (roll.purchaseOrderItemId && !itemIds.has(roll.purchaseOrderItemId)) {
        throw new BadRequestException(`Roll "${roll.rollNumber}" references an item outside this purchase order`);
      }
    }
    const { rolls, purchaseOrderId, supplierId, ...header } = dto;
    const number = await this.numbering.next('GRN');
    const grn = await this.raw.goodsReceiptNote.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        ...header,
        number,
        tenantId: this.ctxTenant(),
        purchaseOrderId,
        supplierId: supplierId ?? po.supplierId,
        status: 'DRAFT',
        createdBy: this.ctx?.userId ?? null,
        updatedBy: this.ctx?.userId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rolls: { create: rolls.map((r) => ({ ...r, tenantId: this.ctxTenant() }) as any) },
      } as any,
    });
    await this.purchaseOrders.recalcReceipts(dto.purchaseOrderId);
    return this.getById(grn.id);
  }

  async update(id: string, dto: UpdateGoodsReceiptDto) {
    const existing = await this.fetchById(id);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only draft goods receipts can be edited');
    }
    const rolls = dto.rolls ?? existing.rolls;
    this.validateRolls(rolls as any[]);
    const { rolls: _rolls, purchaseOrderId, supplierId, ...header } = dto;
    await this.raw.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.goodsReceiptNote.update({
        where: { id },
        data: {
          ...header,
          ...(purchaseOrderId ? { purchaseOrderId } : {}),
          ...(supplierId ? { supplierId } : {}),
          ...(dto.receivedDate ? { receivedDate: new Date(dto.receivedDate) } : {}),
          ...(dto.invoiceDate ? { invoiceDate: new Date(dto.invoiceDate) } : {}),
          updatedBy: this.ctx?.userId ?? null,
          version: { increment: 1 },
        } as any,
      });
      if (dto.rolls) {
        await tx.grnRoll.deleteMany({ where: { grnId: id } });
        await tx.grnRoll.createMany({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: dto.rolls.map((r) => ({ ...r, grnId: id, tenantId: this.ctxTenant() }) as any),
        });
      }
    });
    await this.purchaseOrders.recalcReceipts(existing.purchaseOrderId);
    return this.getById(id);
  }

  /** DRAFT → RECEIVED. Rolls remain PENDING_INSPECTION until inspected. */
  async confirm(id: string) {
    const doc = await this.fetchById(id);
    if (doc.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot confirm a ${doc.status} goods receipt`);
    }
    if (doc.rolls.length === 0) {
      throw new BadRequestException('Add at least one roll before confirming');
    }
    return this.raw.goodsReceiptNote.update({
      where: { id },
      data: { status: 'RECEIVED', updatedBy: this.ctx?.userId ?? null },
    });
  }

  async cancel(id: string) {
    const doc = await this.fetchById(id);
    if (!['DRAFT', 'RECEIVED'].includes(doc.status)) {
      throw new BadRequestException(`Cannot cancel a ${doc.status} goods receipt`);
    }
    await this.raw.goodsReceiptNote.update({
      where: { id },
      data: { status: 'CANCELLED', updatedBy: this.ctx?.userId ?? null },
    });
    await this.purchaseOrders.recalcReceipts(doc.purchaseOrderId);
    return this.getById(id);
  }

  async archive(id: string) {
    const doc = await this.fetchById(id);
    if (doc.status !== 'DRAFT') {
      throw new BadRequestException('Only draft goods receipts can be archived');
    }
    return this.raw.goodsReceiptNote.update({
      where: { id },
      data: { isDeleted: true, deletedBy: this.ctx?.userId ?? null, deletedOn: new Date() },
    });
  }

  private validateRolls(rolls: Array<{ rollNumber: string }>) {
    const seen = new Set<string>();
    for (const roll of rolls) {
      const key = roll.rollNumber.trim().toUpperCase();
      if (seen.has(key)) {
        throw new BadRequestException(`Duplicate roll number: ${roll.rollNumber}`);
      }
      seen.add(key);
    }
  }

  private get raw() {
    return this.prisma.raw;
  }

  private ctxTenant(): string {
    const tenantId = getRequestContext()?.tenantId;
    if (!tenantId) throw new BadRequestException('Goods receipts require a tenant context');
    return tenantId;
  }

  private get ctx() {
    return getRequestContext();
  }
}
