import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getRequestContext } from '@fabriq/database';
import { WorkflowStatus } from '@fabriq/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { ListQueryDto } from '../../../common/pagination.dto';
import { buildListArgs, buildPaginationMeta } from '../../../common/list-args';
import { WorkflowsService } from '../../workflows/workflows.service';
import { NumberingService } from '../numbering.service';
import {
  ConvertRequisitionDto,
  CreateRequisitionDto,
  UpdateRequisitionDto,
} from './dto/requisition.dto';

@Injectable()
export class RequisitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly workflows: WorkflowsService,
  ) {}

  // ── queries (tenant-scoped reads) ───────────────────────────────────────

  async list(dto: ListQueryDto) {
    const args = buildListArgs(dto, {
      searchFields: ['number', 'remarks'],
      model: 'PurchaseRequisition',
      where: { isDeleted: false },
      defaultSortBy: 'createdOn',
    });
    const [items, total] = await Promise.all([
      this.prisma.client.purchaseRequisition.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        include: {
          requestedBy: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true, purchaseOrders: true } },
        },
      }),
      this.prisma.client.purchaseRequisition.count({ where: args.where }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }

  async getById(id: string) {
    const doc = await this.fetchById(id);
    return this.syncWorkflowStatus(doc);
  }

  private async fetchById(id: string) {
    const doc = await this.prisma.client.purchaseRequisition.findFirst({
      where: { id, isDeleted: false },
      include: {
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { id: true, code: true, name: true } },
        items: { orderBy: { createdOn: 'asc' } },
        purchaseOrders: { select: { id: true, number: true, status: true } },
      },
    });
    if (!doc) throw new NotFoundException('Purchase requisition not found');
    return doc;
  }

  /** Lazy status sync: SUBMITTED docs resolve to APPROVED/REJECTED via the workflow engine. */
  private async syncWorkflowStatus(doc: any) {
    if (doc.status !== 'SUBMITTED') return doc;
    const instances = await this.workflows.listInstances('purchase-requisition', doc.id);
    const latest = instances.find((i: any) => i.status !== WorkflowStatus.CANCELLED);
    if (!latest) return doc;
    if (latest.status === WorkflowStatus.APPROVED) {
      await this.raw.purchaseRequisition.update({
        where: { id: doc.id },
        data: { status: 'APPROVED', updatedBy: this.ctx?.userId ?? null },
      });
    } else if (latest.status === WorkflowStatus.REJECTED) {
      await this.raw.purchaseRequisition.update({
        where: { id: doc.id },
        data: { status: 'REJECTED', updatedBy: this.ctx?.userId ?? null },
      });
    }
    return this.fetchById(doc.id);
  }

  // ── mutations (raw client + explicit tenantId — the scoped client cannot
  //    mix scalar FKs with nested relation writes, see packages/database) ──

  async create(dto: CreateRequisitionDto) {
    const { items, requestedById, departmentId, ...header } = dto;
    const number = await this.numbering.next('PR');
    const doc = await this.raw.purchaseRequisition.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        ...header,
        number,
        tenantId: this.ctxTenant(),
        requestedById: requestedById ?? this.ctx?.userId ?? null,
        departmentId: departmentId ?? null,
        createdBy: this.ctx?.userId ?? null,
        updatedBy: this.ctx?.userId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: { create: items.map((i) => ({ ...i, tenantId: this.ctxTenant() }) as any) },
      } as any,
    });
    return this.fetchById(doc.id);
  }

  async update(id: string, dto: UpdateRequisitionDto) {
    const existing = await this.fetchById(id);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only draft requisitions can be edited');
    }
    const { items, requestedById, departmentId, ...header } = dto;
    await this.raw.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.purchaseRequisition.update({
        where: { id },
        data: {
          ...header,
          ...(requestedById ? { requestedById } : {}),
          ...(departmentId ? { departmentId } : {}),
          updatedBy: this.ctx?.userId ?? null,
          version: { increment: 1 },
        } as any,
      });
      if (items) {
        await tx.purchaseRequisitionItem.deleteMany({ where: { requisitionId: id } });
        await tx.purchaseRequisitionItem.createMany({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: items.map((i) => ({ ...i, requisitionId: id, tenantId: this.ctxTenant() }) as any),
        });
      }
    });
    return this.fetchById(id);
  }

  /** DRAFT/REJECTED → SUBMITTED and route through the approval workflow. */
  async submit(id: string) {
    const doc = await this.fetchById(id);
    if (!['DRAFT', 'REJECTED'].includes(doc.status)) {
      throw new BadRequestException(`Cannot submit a ${doc.status} requisition`);
    }
    await this.raw.purchaseRequisition.update({
      where: { id },
      data: { status: 'SUBMITTED', updatedBy: this.ctx?.userId ?? null },
    });
    await this.workflows.startInstance({ entityType: 'purchase-requisition', entityId: id });
    return this.fetchById(id);
  }

  async cancel(id: string) {
    const doc = await this.fetchById(id);
    if (!['DRAFT', 'SUBMITTED'].includes(doc.status)) {
      throw new BadRequestException(`Cannot cancel a ${doc.status} requisition`);
    }
    return this.raw.purchaseRequisition.update({
      where: { id },
      data: { status: 'CANCELLED', updatedBy: this.ctx?.userId ?? null },
    });
  }

  /** APPROVED → creates a DRAFT purchase order from the requisition items. */
  async convert(id: string, dto: ConvertRequisitionDto) {
    const doc = await this.fetchById(id);
    if (doc.status !== 'APPROVED') {
      throw new BadRequestException('Only approved requisitions can be converted to a purchase order');
    }
    const number = await this.numbering.next('PO');
    const po = await this.raw.purchaseOrder.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        number,
        tenantId: this.ctxTenant(),
        supplierId: dto.supplierId,
        requisitionId: id,
        poDate: new Date(),
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
        notes: dto.notes,
        status: 'DRAFT',
        subTotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: 0,
        createdBy: this.ctx?.userId ?? null,
        updatedBy: this.ctx?.userId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: { create: doc.items.map((item: any) => ({ requisitionItemId: item.id, itemName: item.itemName, description: item.description, quantity: item.quantity, unit: item.unit, rate: 0, amount: 0, gstPercent: 0, gstAmount: 0, tenantId: this.ctxTenant() }) as any) },
      } as any,
    });
    await this.raw.purchaseRequisition.update({
      where: { id },
      data: { status: 'CONVERTED', updatedBy: this.ctx?.userId ?? null },
    });
    return po;
  }

  async archive(id: string) {
    const doc = await this.fetchById(id);
    if (doc.status !== 'DRAFT') {
      throw new BadRequestException('Only draft requisitions can be archived');
    }
    return this.raw.purchaseRequisition.update({
      where: { id },
      data: { isDeleted: true, deletedBy: this.ctx?.userId ?? null, deletedOn: new Date() },
    });
  }

  private get raw() {
    return this.prisma.raw;
  }

  private ctxTenant(): string {
    const tenantId = getRequestContext()?.tenantId;
    if (!tenantId) throw new BadRequestException('Requisitions require a tenant context');
    return tenantId;
  }

  private get ctx() {
    return getRequestContext();
  }
}
