import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getRequestContext } from '@fabriq/database';
import { PrismaService } from '../../../prisma/prisma.service';
import { ListQueryDto } from '../../../common/pagination.dto';
import { buildListArgs, buildPaginationMeta } from '../../../common/list-args';
import { NumberingService } from '../numbering.service';
import { FabricRollsService } from '../../cutting/fabric-rolls.service';
import { CreateWarehouseReceiptDto, UpdateWarehouseReceiptDto } from './dto/warehouse-receipt.dto';

/**
 * Warehouse Receipt is the final procurement gate: only APPROVED or
 * SECOND_QUALITY rolls can be received, and each receiving posts an IN
 * StockTransaction — the traceable hand-off to Inventory (Phase 3).
 *
 * Receiving also auto-creates the cutting-room FabricRoll for the roll
 * (via FabricRollsService.createFromGrnRoll, same transaction), so the
 * procurement → cutting hand-off needs no manual re-entry.
 */
@Injectable()
export class WarehouseReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly rolls: FabricRollsService,
  ) {}

  /** Rolls eligible for warehouse receipt (inspected, not yet received). */
  async approvedRolls() {
    return this.prisma.client.grnRoll.findMany({
      where: {
        status: { in: ['APPROVED', 'SECOND_QUALITY'] },
        warehouseReceipts: { none: { isDeleted: false } },
      },
      orderBy: { createdOn: 'asc' },
      include: {
        grn: { select: { id: true, number: true } },
        purchaseOrderItem: {
          select: { id: true, itemName: true, unit: true, rate: true },
        },
        inspection: { select: { id: true, decision: true, qualityScore: true } },
      },
    });
  }

  async list(dto: ListQueryDto) {
    const args = buildListArgs(dto, {
      searchFields: ['number'],
      model: 'WarehouseReceipt',
      where: { isDeleted: false },
      defaultSortBy: 'createdOn',
    });
    const [items, total] = await Promise.all([
      this.prisma.client.warehouseReceipt.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        include: {
          grnRoll: {
            select: {
              id: true,
              rollNumber: true,
              fabricType: true,
              grn: { select: { number: true } },
            },
          },
          warehouse: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.client.warehouseReceipt.count({ where: args.where }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }

  async getById(id: string) {
    const doc = await this.prisma.client.warehouseReceipt.findFirst({
      where: { id, isDeleted: false },
      include: {
        grnRoll: {
          include: {
            grn: { select: { id: true, number: true } },
            purchaseOrderItem: { select: { id: true, itemName: true, unit: true, rate: true } },
            inspection: { select: { id: true, decision: true, qualityScore: true, totalPoints: true } },
            fabricRolls: {
              where: { isDeleted: false },
              select: { id: true, number: true, status: true },
            },
          },
        },
        warehouse: true,
      },
    });
    if (!doc) throw new NotFoundException('Warehouse receipt not found');
    return doc;
  }

  async create(dto: CreateWarehouseReceiptDto) {
    const roll = await this.prisma.client.grnRoll.findFirst({
      where: { id: dto.grnRollId },
      include: {
        purchaseOrderItem: true,
        warehouseReceipts: { where: { isDeleted: false } },
        grn: { select: { supplier: { select: { name: true, code: true } } } },
      },
    });
    if (!roll) throw new NotFoundException('Roll not found');
    if (!['APPROVED', 'SECOND_QUALITY'].includes(roll.status)) {
      throw new BadRequestException(
        `Only inspected (approved / second quality) rolls can be received — this roll is ${roll.status}`,
      );
    }
    if (roll.warehouseReceipts.length > 0) {
      throw new BadRequestException('This roll has already been received into a warehouse');
    }
    const warehouse = await this.prisma.client.warehouse.findFirst({
      where: { id: dto.warehouseId, isDeleted: false },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const number = await this.numbering.next('WR');
    const unit = roll.purchaseOrderItem?.unit ?? 'METERS';
    const quantity =
      unit === 'METERS'
        ? Number(roll.length ?? 1)
        : unit === 'KILOGRAMS'
          ? Number(roll.weight ?? 1)
          : 1;

    const { grnRollId, warehouseId, ...header } = dto;
    const receipt = await this.raw.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wr = await tx.warehouseReceipt.create({
        data: {
          ...header,
          number,
          tenantId: this.ctxTenant(),
          grnRollId,
          warehouseId,
          receivedOn: dto.receivedOn ? new Date(dto.receivedOn) : new Date(),
          createdBy: this.ctx?.userId ?? null,
          updatedBy: this.ctx?.userId ?? null,
        } as any,
      });
      await tx.grnRoll.update({
        where: { id: grnRollId },
        data: { status: 'RECEIVED_IN_WAREHOUSE' },
      });
      await tx.stockTransaction.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          number,
          tenantId: this.ctxTenant(),
          transactionType: 'IN',
          warehouseId,
          itemName: roll.purchaseOrderItem?.itemName ?? roll.fabricType ?? roll.rollNumber,
          quantity,
          unit,
          batch: roll.batch,
          lot: roll.lot,
          rack: dto.rack,
          shelf: dto.shelf,
          bin: dto.bin,
          unitCost: roll.purchaseOrderItem?.rate ?? null,
          refEntityType: 'warehouse-receipt',
          refEntityId: wr.id,
          createdBy: this.ctx?.userId ?? null,
        } as any,
      });
      // Auto-create the cutting-room FabricRoll (same transaction — receiving
      // and roll creation succeed or fail together). Idempotent: if a roll
      // already exists for this GRN roll (e.g. archived receipt → re-receive),
      // it is reused instead of duplicated.
      const existingFabricRoll = await tx.fabricRoll.findFirst({
        where: { tenantId: this.ctxTenant(), grnRollId, isDeleted: false },
        select: { id: true },
      });
      if (!existingFabricRoll) {
        await this.rolls.createFromGrnRoll(
          roll,
          { supplierRef: roll.grn?.supplier?.name ?? roll.grn?.supplier?.code ?? undefined },
          tx,
        );
      }
      return wr;
    });
    return this.getById(receipt.id);
  }

  async update(id: string, dto: UpdateWarehouseReceiptDto) {
    await this.getById(id);
    const { grnRollId, warehouseId, ...header } = dto;
    return this.raw.warehouseReceipt.update({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        ...header,
        ...(grnRollId ? { grnRollId } : {}),
        ...(warehouseId ? { warehouseId } : {}),
        updatedBy: this.ctx?.userId ?? null,
        version: { increment: 1 },
      } as any,
    });
  }

  /** Archiving reverses the stock posting and frees the roll for rework. */
  async archive(id: string) {
    const doc = await this.getById(id);
    await this.raw.$transaction(async (tx) => {
      await tx.warehouseReceipt.update({
        where: { id },
        data: { isDeleted: true, deletedBy: this.ctx?.userId ?? null, deletedOn: new Date() },
      });
      await tx.stockTransaction.deleteMany({
        where: { refEntityType: 'warehouse-receipt', refEntityId: id },
      });
      await tx.grnRoll.update({
        where: { id: doc.grnRollId },
        data: { status: 'APPROVED' },
      });
    });
    return { archived: true };
  }

  private get raw() {
    return this.prisma.raw;
  }

  private ctxTenant(): string {
    const tenantId = getRequestContext()?.tenantId;
    if (!tenantId) throw new BadRequestException('Warehouse receipts require a tenant context');
    return tenantId;
  }

  private get ctx() {
    return getRequestContext();
  }
}
