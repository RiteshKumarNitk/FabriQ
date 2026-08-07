import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getRequestContext } from '@fabriq/database';
import { RollCondition, WorkflowStatus } from '@fabriq/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { ListQueryDto } from '../../../common/pagination.dto';
import { buildListArgs, buildPaginationMeta } from '../../../common/list-args';
import { WorkflowsService } from '../../workflows/workflows.service';
import { NumberingService } from '../numbering.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly workflows: WorkflowsService,
  ) {}

  // ── queries ─────────────────────────────────────────────────────────────

  async list(dto: ListQueryDto) {
    const args = buildListArgs(dto, {
      searchFields: ['number', 'notes'],
      where: { isDeleted: false },
      defaultSortBy: 'createdOn',
    });
    const [items, total] = await Promise.all([
      this.prisma.client.purchaseOrder.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true, receipts: true } },
        },
      }),
      this.prisma.client.purchaseOrder.count({ where: args.where }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }

  async getById(id: string) {
    const doc = await this.fetchById(id);
    return this.syncWorkflowStatus(doc);
  }

  private async fetchById(id: string) {
    const doc = await this.prisma.client.purchaseOrder.findFirst({
      where: { id, isDeleted: false },
      include: {
        supplier: true,
        requisition: { select: { id: true, number: true } },
        items: { orderBy: { createdOn: 'asc' } },
        receipts: {
          where: { isDeleted: false },
          orderBy: { createdOn: 'desc' },
          select: { id: true, number: true, status: true, invoiceNumber: true, receivedDate: true },
        },
      },
    });
    if (!doc) throw new NotFoundException('Purchase order not found');
    return doc;
  }

  private async syncWorkflowStatus(doc: any) {
    if (doc.status !== 'SUBMITTED') return doc;
    const instances = await this.workflows.listInstances('purchase-order', doc.id);
    const latest = instances.find((i: any) => i.status !== WorkflowStatus.CANCELLED);
    if (!latest) return doc;
    if (latest.status === WorkflowStatus.APPROVED) {
      await this.prisma.client.purchaseOrder.update({
        where: { id: doc.id },
        data: { status: 'APPROVED', updatedBy: this.ctx?.userId ?? null },
      });
    } else if (latest.status === WorkflowStatus.REJECTED) {
      // PurchaseOrderStatus has no REJECTED — return to DRAFT for rework.
      await this.prisma.client.purchaseOrder.update({
        where: { id: doc.id },
        data: { status: 'DRAFT', updatedBy: this.ctx?.userId ?? null },
      });
    }
    return this.fetchById(doc.id);
  }

  // ── mutations ───────────────────────────────────────────────────────────

  async create(dto: CreatePurchaseOrderDto) {
    const { items, supplierId, requisitionId, ...header } = dto;
    const number = await this.numbering.next('PO');
    const totals = this.computeTotals(items, header.taxPercent ?? 0, header.discountPercent ?? 0);
    const doc = await this.raw.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          ...header,
          number,
          tenantId: this.ctxTenant(),
          supplierId,
          requisitionId: requisitionId ?? null,
          poDate: dto.poDate ? new Date(dto.poDate) : new Date(),
          deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
          ...totals,
          createdBy: this.ctx?.userId ?? null,
          updatedBy: this.ctx?.userId ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items: { create: items.map((i) => ({ ...this.itemWithAmounts(i), tenantId: this.ctxTenant() })) as any },
        } as any,
      });
      if (requisitionId) {
        await tx.purchaseRequisition.updateMany({
          where: { id: requisitionId, status: 'APPROVED' },
          data: { status: 'CONVERTED', updatedBy: this.ctx?.userId ?? null },
        });
      }
      return po;
    });
    return this.fetchById(doc.id);
  }

  async update(id: string, dto: UpdatePurchaseOrderDto) {
    const existing = await this.fetchById(id);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only draft purchase orders can be edited');
    }
    const { items, supplierId, requisitionId, ...header } = dto;
    const totals =
      items !== undefined || header.taxPercent !== undefined || header.discountPercent !== undefined
        ? this.computeTotals(
            (items ?? existing.items) as any,
            header.taxPercent ?? Number(existing.taxPercent),
            header.discountPercent ?? Number(existing.discountPercent),
          )
        : undefined;
    await this.raw.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          ...header,
          ...(totals ?? {}),
          ...(supplierId ? { supplierId } : {}),
          ...(requisitionId ? { requisitionId } : {}),
          updatedBy: this.ctx?.userId ?? null,
          version: { increment: 1 },
        } as any,
      });
      if (items) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderItem.createMany({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: items.map((i) => ({ ...this.itemWithAmounts(i), purchaseOrderId: id, tenantId: this.ctxTenant() }) as any),
        });
      }
    });
    return this.fetchById(id);
  }

  /** DRAFT → SUBMITTED; routes through the workflow engine when a definition exists. */
  async submit(id: string) {
    const doc = await this.fetchById(id);
    if (doc.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot submit a ${doc.status} purchase order`);
    }
    await this.raw.purchaseOrder.update({
      where: { id },
      data: { status: 'SUBMITTED', updatedBy: this.ctx?.userId ?? null },
    });
    // Optional approval flow: without a purchase-order workflow definition the
    // PO stays SUBMITTED and is approved directly via approve()/reject().
    try {
      await this.workflows.startInstance({ entityType: 'purchase-order', entityId: id });
    } catch {
      /* no definition configured — manual approval path */
    }
    return this.fetchById(id);
  }

  async approve(id: string) {
    const doc = await this.fetchById(id);
    if (doc.status !== 'SUBMITTED') {
      throw new BadRequestException('Only submitted purchase orders can be approved');
    }
    return this.raw.purchaseOrder.update({
      where: { id },
      data: { status: 'APPROVED', updatedBy: this.ctx?.userId ?? null },
    });
  }

  async reject(id: string) {
    const doc = await this.fetchById(id);
    if (doc.status !== 'SUBMITTED') {
      throw new BadRequestException('Only submitted purchase orders can be rejected');
    }
    return this.raw.purchaseOrder.update({
      where: { id },
      data: { status: 'DRAFT', updatedBy: this.ctx?.userId ?? null },
    });
  }

  async cancel(id: string) {
    const doc = await this.fetchById(id);
    if (!['DRAFT', 'SUBMITTED', 'APPROVED'].includes(doc.status)) {
      throw new BadRequestException(`Cannot cancel a ${doc.status} purchase order`);
    }
    return this.raw.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELLED', updatedBy: this.ctx?.userId ?? null },
    });
  }

  async archive(id: string) {
    const doc = await this.fetchById(id);
    if (doc.status !== 'DRAFT') {
      throw new BadRequestException('Only draft purchase orders can be archived');
    }
    return this.raw.purchaseOrder.update({
      where: { id },
      data: { isDeleted: true, deletedBy: this.ctx?.userId ?? null, deletedOn: new Date() },
    });
  }

  /**
   * Recomputes each item's receivedQty from the GOOD rolls received against
   * it and rolls the PO status forward: COMPLETED when every line is fully
   * received, PARTIALLY_RECEIVED when at least one line has progress.
   * Called by the goods-receipts service after every GRN save.
   */
  async recalcReceipts(poId: string) {
    const items = await this.prisma.client.purchaseOrderItem.findMany({
      where: { purchaseOrderId: poId },
    });
    if (items.length === 0) return;
    const rolls = await this.prisma.client.grnRoll.findMany({
      where: {
        purchaseOrderItemId: { in: items.map((i) => i.id) },
        condition: RollCondition.GOOD,
        grn: { isDeleted: false, status: { not: 'CANCELLED' } },
      },
    });
    const unitByItem = new Map(items.map((i) => [i.id, i.unit]));
    const receivedByItem = new Map<string, number>();
    for (const roll of rolls) {
      if (!roll.purchaseOrderItemId) continue;
      const unit = unitByItem.get(roll.purchaseOrderItemId);
      const qty =
        unit === 'METERS'
          ? Number(roll.length ?? 0)
          : unit === 'KILOGRAMS'
            ? Number(roll.weight ?? 0)
            : 1;
      receivedByItem.set(
        roll.purchaseOrderItemId,
        (receivedByItem.get(roll.purchaseOrderItemId) ?? 0) + qty,
      );
    }
    await Promise.all(
      items.map((item) =>
        this.raw.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQty: receivedByItem.get(item.id) ?? 0 },
        }),
      ),
    );

    const po = await this.raw.purchaseOrder.findFirst({ where: { id: poId } });
    if (!po || po.status === 'CANCELLED') return;
    const updated = await this.raw.purchaseOrderItem.findMany({
      where: { purchaseOrderId: poId },
    });
    const fullyReceived = updated.every((i) => Number(i.receivedQty) >= Number(i.quantity));
    const anyReceived = updated.some((i) => Number(i.receivedQty) > 0);
    let next: string = po.status;
    if (fullyReceived) next = 'COMPLETED';
    else if (anyReceived) next = 'PARTIALLY_RECEIVED';
    else if (!['DRAFT', 'SUBMITTED'].includes(po.status)) next = 'APPROVED';
    if (next !== po.status) {
      await this.raw.purchaseOrder.update({
        where: { id: poId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { status: next as any },
      });
    }
  }

  /** Print-ready HTML document (browser Print → Save as PDF). */
  async printHtml(id: string): Promise<{ html: string; fileName: string }> {
    const po = await this.fetchById(id);
    const rows = po.items
      .map(
        (i: any) => `
        <tr>
          <td>${escapeHtml(i.itemName)}${i.description ? `<div class="sub">${escapeHtml(i.description)}</div>` : ''}</td>
          <td class="num">${Number(i.quantity).toLocaleString()}</td>
          <td>${i.unit}</td>
          <td class="num">${Number(i.rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          <td class="num">${Number(i.gstPercent).toFixed(0)}%</td>
          <td class="num">${Number(i.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>`,
      )
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(po.number)}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#111;margin:40px;font-size:13px}
  h1{font-size:20px;margin:0}.muted{color:#666}
  .grid{display:flex;justify-content:space-between;gap:24px;margin:24px 0}
  .grid>div{flex:1}table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border:1px solid #999;padding:6px 8px;text-align:left}
  th{background:#f2f2f2}td.num,th.num{text-align:right}
  .totals{margin-left:auto;width:320px;margin-top:12px}
  .totals td{border:none;padding:3px 6px}.totals tr.total td{border-top:2px solid #111;font-weight:bold}
  .foot{margin-top:32px;color:#666;font-size:11px}
  .badge{display:inline-block;border:1px solid #999;padding:2px 10px;border-radius:10px;font-size:11px;margin-left:8px}
  .sub{color:#666;font-size:11px;margin-top:2px}
</style></head><body>
  <h1>PURCHASE ORDER</h1>
  <div class="muted">${escapeHtml(po.number)} <span class="badge">${po.status.replace(/_/g, ' ')}</span></div>
  <div class="grid">
    <div><b>Supplier</b><br>${escapeHtml(po.supplier.name)}<br>
      ${po.supplier.billingAddress ? escapeHtml(po.supplier.billingAddress) + '<br>' : ''}
      ${po.supplier.city ? escapeHtml(po.supplier.city) : ''} ${po.supplier.state ? escapeHtml(po.supplier.state) : ''}
      ${po.supplier.gstin ? `<br>GSTIN: ${escapeHtml(po.supplier.gstin)}` : ''}
    </div>
    <div><b>Order Details</b><br>PO Date: ${new Date(po.poDate).toLocaleDateString()}<br>
      Delivery: ${po.deliveryDate ? new Date(po.deliveryDate).toLocaleDateString() : '—'}<br>
      Currency: ${escapeHtml(po.currency)}<br>Payment: ${po.paymentTerms ? escapeHtml(po.paymentTerms) : '—'}</div>
  </div>
  <table><thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Rate</th><th class="num">GST</th><th class="num">Amount</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${Number(po.subTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
    <tr><td>Discount (${Number(po.discountPercent)}%)</td><td class="num">-${Number(po.discountAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
    <tr><td>Tax</td><td class="num">${Number(po.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
    <tr class="total"><td>Total (${escapeHtml(po.currency)})</td><td class="num">${Number(po.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
  </table>
  <div class="foot">Generated by FabriQ · ${new Date().toLocaleString()} · Authorized signature: ______________</div>
</body></html>`;
    return { html, fileName: `${po.number}.html` };
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private itemWithAmounts(i: any) {
    const amount = Number(i.quantity) * Number(i.rate);
    const gstAmount = amount * (Number(i.gstPercent ?? 0) / 100);
    return {
      requisitionItemId: i.requisitionItemId ?? null,
      itemName: i.itemName,
      description: i.description ?? null,
      quantity: i.quantity,
      unit: i.unit ?? 'METERS',
      rate: i.rate,
      amount,
      gstPercent: i.gstPercent ?? 0,
      gstAmount,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private computeTotals(items: any[], taxPercent: number, discountPercent: number) {
    let subTotal = 0;
    let taxAmount = 0;
    for (const i of items) {
      const amount = Number(i.quantity) * Number(i.rate);
      subTotal += amount;
      taxAmount += amount * (Number(i.gstPercent ?? 0) / 100);
    }
    const discountAmount = subTotal * (Number(discountPercent) / 100);
    const totalAmount = subTotal - discountAmount + taxAmount;
    return { subTotal, taxAmount, discountAmount, totalAmount };
  }

  private get raw() {
    return this.prisma.raw;
  }

  private ctxTenant(): string {
    const tenantId = getRequestContext()?.tenantId;
    if (!tenantId) throw new BadRequestException('Purchase orders require a tenant context');
    return tenantId;
  }

  private get ctx() {
    return getRequestContext();
  }
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
