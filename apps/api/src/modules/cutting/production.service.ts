import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CutOrderStatus,
  CutOperationStatus,
  LayPlanStatus,
  RollTransactionType,
  SegmentType,
  round4,
  sizeWiseFulfillment,
  validatePlacement,
  type DefectSpan,
} from '@fabriq/shared';
import { getRequestContext } from '@fabriq/database';
import { PrismaService } from '../../prisma/prisma.service';
import { parseListFilters, resolveListSort } from '../../common/list-filters';
import { NumberingService } from '../procurement/numbering.service';
import { FabricRollsService } from './fabric-rolls.service';

/** Columns the cut-orders list endpoint accepts as filters / sort keys (whitelisted). */
const CUT_ORDER_FILTER_FIELDS = ['status', 'styleRef', 'color', 'fabricType'] as const;
const CUT_ORDER_SORTABLE_FIELDS = [
  'number',
  'styleRef',
  'color',
  'fabricType',
  'status',
  'createdOn',
  'updatedOn',
] as const;

/** Lay plans are sorted server-side against this whitelist. */
const LAY_SORTABLE_FIELDS = [
  'number',
  'status',
  'ply',
  'markerLengthCm',
  'theoreticalPieces',
  'createdOn',
] as const;

/**
 * Production flow: Cut Order → Lay Plans (fabric allocation) → Cut Operations
 * (actual results + ledger writes).
 *
 * Lay creation reserves a span of the roll inside a single AVAILABLE segment;
 * completing a cut operation converts the reservation into CONSUMED, appends
 * RollTransaction rows and moves the roll's remaining fabric. Planned and
 * actual numbers are kept strictly apart.
 */
@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly rolls: FabricRollsService,
  ) {}

  // ── Cut orders ──────────────────────────────────────────────────────────

  async listCutOrders(query: {
    search?: string;
    status?: string;
    filters?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    // filters JSON (UI convention) + legacy bare status param for compat.
    const filters = parseListFilters(query.filters, CUT_ORDER_FILTER_FIELDS);
    const where: Record<string, unknown> = { isDeleted: false, ...filters };
    if (query.status) where['status'] = query.status;
    if (query.search) {
      where['OR'] = ['number', 'styleRef', 'color', 'fabricType'].map((f) => {
        const cond: Record<string, unknown> = { contains: query.search, mode: 'insensitive' };
        return { [f]: cond };
      });
    }
    const { orderBy } = resolveListSort(query.sortBy, query.sortOrder, {
      sortableFields: CUT_ORDER_SORTABLE_FIELDS,
      defaultSortBy: 'createdOn',
      defaultSortOrder: 'desc',
    });
    const [items, total] = await Promise.all([
      this.prisma.client.cutOrder.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { layPlans: true } } },
      }),
      this.prisma.client.cutOrder.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async getCutOrder(id: string) {
    const order = await this.prisma.client.cutOrder.findFirst({
      where: { id, isDeleted: false },
      include: {
        layPlans: {
          orderBy: { createdOn: 'asc' },
          include: {
            marker: { select: { id: true, number: true, efficiencyPct: true, sizeRatioJson: true } },
            roll: { select: { id: true, number: true } },
            cutOperations: { orderBy: { createdOn: 'asc' } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Cut order not found');
    return { ...order, fulfillment: this.fulfillment(order as any) };
  }

  async createCutOrder(dto: {
    number?: string;
    styleRef?: string;
    color?: string;
    fabricType?: string;
    required: Record<string, number>;
    notes?: string;
  }) {
    if (!dto.required || Object.keys(dto.required).length === 0) {
      throw new BadRequestException('Cut order requires at least one size quantity');
    }
    for (const [size, qty] of Object.entries(dto.required)) {
      if (!Number.isFinite(qty) || Math.floor(qty) < 0) {
        throw new BadRequestException(`Invalid quantity for size ${size}`);
      }
    }
    const ctx = getRequestContext();
    const number = dto.number?.trim() || (await this.numbering.next('CO'));
    const order = await this.prisma.raw.cutOrder.create({
      data: {
        tenantId: this.tenantId(),
        number,
        styleRef: dto.styleRef,
        color: dto.color,
        fabricType: dto.fabricType,
        requiredJson: dto.required,
        notes: dto.notes,
        createdBy: ctx?.userId ?? null,
        updatedBy: ctx?.userId ?? null,
      },
    });
    return this.getCutOrder(order.id);
  }

  async updateCutOrder(id: string, dto: { styleRef?: string; color?: string; fabricType?: string; required?: Record<string, number>; notes?: string; status?: string }) {
    await this.getOrderRow(id);
    if (dto.status && dto.status === CutOrderStatus.APPROVED) {
      return this.approveCutOrder(id);
    }
    const ctx = getRequestContext();
    await this.prisma.raw.cutOrder.update({
      where: { id },
      data: {
        ...(dto.styleRef !== undefined ? { styleRef: dto.styleRef } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.fabricType !== undefined ? { fabricType: dto.fabricType } : {}),
        ...(dto.required !== undefined ? { requiredJson: dto.required } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        updatedBy: ctx?.userId ?? null,
        version: { increment: 1 },
      },
    });
    return this.getCutOrder(id);
  }

  async approveCutOrder(id: string) {
    const order = await this.getOrderRow(id);
    if (order.status !== CutOrderStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT cut orders can be approved');
    }
    const ctx = getRequestContext();
    await this.prisma.raw.cutOrder.update({
      where: { id },
      data: { status: CutOrderStatus.APPROVED, approvedOn: new Date(), approvedBy: ctx?.userId ?? null, updatedBy: ctx?.userId ?? null },
    });
    return this.getCutOrder(id);
  }

  async archiveCutOrder(id: string) {
    await this.getOrderRow(id);
    const layCount = await this.prisma.client.layPlan.count({ where: { cutOrderId: id } });
    if (layCount > 0) throw new BadRequestException('Cut order has lay plans and cannot be archived');
    return this.prisma.raw.cutOrder.update({
      where: { id },
      data: { isDeleted: true, deletedOn: new Date(), deletedBy: getRequestContext()?.userId ?? null },
    });
  }

  /** Required vs planned vs actual per size — shared engine, never silently rounded. */
  private fulfillment(order: { requiredJson: unknown; layPlans: Array<any> }) {
    return sizeWiseFulfillment(
      order.requiredJson as Record<string, number> | null,
      (order.layPlans ?? []).map((lay) => ({
        status: lay.status,
        ply: lay.ply,
        sizeRatio: (lay.marker?.sizeRatioJson ?? {}) as Record<string, number>,
        cutOperations: lay.cutOperations ?? [],
      })),
    );
  }

  // ── Lay plans ───────────────────────────────────────────────────────────

  async listLayPlans(query: {
    cutOrderId?: string;
    rollId?: string;
    status?: string;
    search?: string;
    filters?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {};
    if (query.cutOrderId) where['cutOrderId'] = query.cutOrderId;
    if (query.rollId) where['rollId'] = query.rollId;
    if (query.status) where['status'] = query.status;
    if (query.search) {
      where['OR'] = ['number', 'notes'].map((f) => ({
        [f]: { contains: query.search, mode: 'insensitive' },
      }));
    }
    const { orderBy } = resolveListSort(query.sortBy, query.sortOrder, {
      sortableFields: LAY_SORTABLE_FIELDS,
      defaultSortBy: 'createdOn',
      defaultSortOrder: 'desc',
    });
    const [items, total] = await Promise.all([
      this.prisma.client.layPlan.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          marker: { select: { id: true, number: true, styleRef: true, efficiencyPct: true, garmentsPerMarker: true } },
          roll: { select: { id: true, number: true, fabricType: true, color: true } },
          cutOrder: { select: { id: true, number: true } },
          cutOperations: { orderBy: { createdOn: 'asc' } },
        },
      }),
      this.prisma.client.layPlan.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async getLayPlan(id: string) {
    const lay = await this.prisma.client.layPlan.findFirst({
      where: { id },
      include: {
        marker: { include: { pieces: true } },
        roll: true,
        cutOrder: { select: { id: true, number: true } },
        cutOperations: { orderBy: { createdOn: 'asc' } },
      },
    });
    if (!lay) throw new NotFoundException('Lay plan not found');
    return lay;
  }

  /** Free AVAILABLE spans on a roll the planner can drop a marker into. */
  async availableSlots(rollId: string, markerLengthCm?: number) {
    const roll = await this.prisma.client.fabricRoll.findFirst({ where: { id: rollId, isDeleted: false } });
    if (!roll) throw new NotFoundException('Fabric roll not found');
    const segments = await this.prisma.client.fabricSegment.findMany({
      where: { rollId, type: SegmentType.AVAILABLE },
      orderBy: { startCm: 'asc' },
    });
    return {
      roll: { id: roll.id, number: roll.number, remainingLengthCm: Number(roll.remainingLengthCm), usableWidthCm: Number(roll.usableWidthCm) },
      slots: segments
        .map((s) => ({
          segmentId: s.id,
          startCm: Number(s.startCm),
          endCm: Number(s.endCm),
          lengthCm: round4(Number(s.endCm) - Number(s.startCm)),
          fits: markerLengthCm != null ? Number(s.endCm) - Number(s.startCm) >= markerLengthCm - 1e-6 : undefined,
        }))
        .filter((s) => markerLengthCm == null || s.fits),
    };
  }

  /**
   * Create a lay plan: reserves marker length inside one AVAILABLE segment of
   * the roll. Validates fit, defect crossing (explicit acknowledgment
   * required) and ply > 0. Physical roll length is NEVER multiplied by ply.
   */
  async createLayPlan(dto: {
    markerId: string;
    rollId: string;
    ply: number;
    cutOrderId?: string;
    markerStartCm?: number;
    allowDefectOverlap?: boolean;
    notes?: string;
  }) {
    if (!Number.isInteger(dto.ply) || dto.ply <= 0) {
      throw new BadRequestException('Ply must be a positive whole number');
    }
    const marker = await this.prisma.client.marker.findFirst({
      where: { id: dto.markerId, isDeleted: false },
      include: { pieces: true },
    });
    if (!marker) throw new NotFoundException('Marker not found');
    if (marker.status !== 'FINALIZED') {
      throw new BadRequestException('Only finalized markers can be planned into lays');
    }
    const roll = await this.prisma.client.fabricRoll.findFirst({ where: { id: dto.rollId, isDeleted: false } });
    if (!roll) throw new NotFoundException('Fabric roll not found');
    if (Number(roll.usableWidthCm) + 1e-6 < Number(marker.widthCm)) {
      throw new BadRequestException(
        `Marker width (${Number(marker.widthCm)} cm) exceeds the roll's usable width (${Number(roll.usableWidthCm)} cm)`,
      );
    }
    if (dto.cutOrderId) {
      const order = await this.prisma.client.cutOrder.findFirst({ where: { id: dto.cutOrderId, isDeleted: false } });
      if (!order) throw new NotFoundException('Cut order not found');
    }

    const markerLengthCm = Number(marker.lengthCm);
    if (markerLengthCm <= 0) throw new BadRequestException('Marker length must be greater than zero');

    const gpm = Object.values((marker.sizeRatioJson ?? {}) as Record<string, number>).reduce(
      (s: number, v) => s + Math.max(0, Math.floor(Number(v))),
      0,
    );
    const theoretical = gpm * dto.ply;
    const ctx = getRequestContext();
    const number = await this.numbering.next('LP');

    // Everything that decides the span runs INSIDE a transaction that holds
    // the roll row lock — two parallel lay creations must never reserve the
    // same fabric span (proven racy by scripts/ledger-concurrency.mjs).
    const lay = await this.prisma.raw.$transaction(
      async (tx: any) => {
        // Serialize all ledger writers on this roll (lays, cuts, cancels).
        await tx.$queryRaw`SELECT id FROM "FabricRoll" WHERE id = ${roll.id} FOR UPDATE`;

        // Span: explicit placement, or first-fit inside a committed AVAILABLE
        // segment (segments are rebuilt under the same lock, so they are
        // consistent here).
        let startCm: number;
        if (dto.markerStartCm != null) {
          startCm = round4(dto.markerStartCm);
        } else {
          const slots = await tx.fabricSegment.findMany({
            where: { rollId: roll.id, type: SegmentType.AVAILABLE },
            orderBy: { startCm: 'asc' },
          });
          const fit = slots.find((s: any) => Number(s.endCm) - Number(s.startCm) >= markerLengthCm - 1e-6);
          if (!fit) {
            throw new BadRequestException('No available fabric segment fits this marker — inspect the roll timeline');
          }
          startCm = Number(fit.startCm);
        }
        const endCm = round4(startCm + markerLengthCm);
        if (endCm > Number(roll.originalLengthCm) + 1e-6) {
          throw new BadRequestException('Marker extends past the end of the roll');
        }

        // Authoritative overlap check against committed lays (segments are
        // DERIVED from these rows — this is the ground truth).
        const active = await tx.layPlan.findMany({
          where: { rollId: roll.id, status: { not: LayPlanStatus.CANCELLED } },
          select: { markerStartCm: true, markerLengthCm: true },
        });
        const clash = active.some(
          (l: any) =>
            Number(l.markerStartCm) < endCm - 1e-6 && startCm < Number(l.markerStartCm) + Number(l.markerLengthCm) - 1e-6,
        );
        // The span must also sit inside a single AVAILABLE segment.
        const containing = await tx.fabricSegment.findFirst({
          where: {
            rollId: roll.id,
            type: SegmentType.AVAILABLE,
            startCm: { lte: startCm + 1e-6 },
            endCm: { gte: endCm - 1e-6 },
          },
        });
        if (clash || !containing) {
          throw new BadRequestException('The marker span crosses a reserved, consumed or defective section of the roll');
        }

        // Defect-awareness: warn explicitly (defects are already carved out
        // of AVAILABLE segments — defense in depth for adjacent defects).
        if (!dto.allowDefectOverlap) {
          const defects = await tx.fabricDefect.findMany({
            where: { rollId: roll.id, isDeleted: false },
            select: { id: true, startCm: true, endCm: true },
          });
          const issues = validatePlacement({
            pieces: [],
            usableWidthCm: Number(roll.usableWidthCm),
            markerLengthCm,
            defects: defects.map((d: any) => ({ id: d.id, startCm: Number(d.startCm), endCm: Number(d.endCm) })),
            markerStartCm: startCm,
          });
          if (issues.some((i: any) => i.code === 'CROSSES_DEFECT')) {
            throw new BadRequestException('Marker placement crosses a defect area — confirm with allowDefectOverlap=true or move the marker');
          }
        }

        const freshRoll = await tx.fabricRoll.findUnique({ where: { id: roll.id } });
        const created = await tx.layPlan.create({
          data: {
            tenantId: this.tenantId(),
            number,
            status: LayPlanStatus.PLANNED,
            cutOrderId: dto.cutOrderId,
            markerId: marker.id,
            rollId: roll.id,
            ply: dto.ply,
            garmentsPerMarker: gpm,
            markerLengthCm,
            markerStartCm: startCm,
            theoreticalPieces: theoretical,
            fabricPlannedCm: markerLengthCm,
            notes: dto.notes,
            createdBy: ctx?.userId ?? null,
            updatedBy: ctx?.userId ?? null,
          },
        });
        // Reserved ledger entry (soft hold — remaining fabric is untouched).
        await tx.rollTransaction.create({
          data: {
            tenantId: this.tenantId(),
            rollId: roll.id,
            type: RollTransactionType.RESERVED,
            quantityCm: -markerLengthCm,
            balanceAfterCm: Number(freshRoll?.remainingLengthCm ?? 0),
            refType: 'lay-plan',
            refId: created.id,
            refLabel: `Lay ${created.number}`,
            createdBy: ctx?.userId ?? null,
          },
        });
        await tx.fabricRoll.update({
          where: { id: roll.id },
          data: {
            status: 'IN_CUTTING',
            cutQtyPlanned: { increment: theoretical },
            updatedBy: ctx?.userId ?? null,
            version: { increment: 1 },
          },
        });
        await this.rolls.rebuildSegments(tx as any, roll.id);
        return created;
      },
      { timeout: 20000, maxWait: 10000 },
    );
    return this.getLayPlan(lay.id);
  }

  async cancelLayPlan(id: string) {
    const ctx = getRequestContext();
    await this.prisma.raw.$transaction(
      async (tx: any) => {
        // Serialize all ledger writers on this roll (a parallel cut of the
        // same lay must either see CANCELLED and fail, or win first).
        await tx.$queryRaw`SELECT id FROM "FabricRoll" WHERE id = (SELECT "rollId" FROM "LayPlan" WHERE id = ${id}) FOR UPDATE`;

        const lay = await tx.layPlan.findFirst({ where: { id } });
        if (!lay) throw new NotFoundException('Lay plan not found');
        if (lay.status === LayPlanStatus.COMPLETED) {
          throw new BadRequestException('A completed lay cannot be cancelled — record an adjustment on the roll instead');
        }
        if (lay.status === LayPlanStatus.CANCELLED) {
          throw new BadRequestException('Lay is already cancelled');
        }
        const completedOps = await tx.cutOperation.count({
          where: { layPlanId: id, status: CutOperationStatus.COMPLETED },
        });
        if (completedOps > 0) throw new BadRequestException('Lay has completed cutting operations');

        await tx.layPlan.update({
          where: { id },
          data: { status: LayPlanStatus.CANCELLED, updatedBy: ctx?.userId ?? null },
        });
        const roll = await tx.fabricRoll.findUnique({ where: { id: lay.rollId } });
        await tx.rollTransaction.create({
          data: {
            tenantId: this.tenantId(),
            rollId: lay.rollId,
            type: RollTransactionType.RELEASED,
            quantityCm: Number(lay.markerLengthCm),
            balanceAfterCm: Number(roll?.remainingLengthCm ?? 0),
            refType: 'lay-plan',
            refId: lay.id,
            refLabel: `Released lay ${lay.number}`,
            createdBy: ctx?.userId ?? null,
          },
        });
        if (roll) {
          const plannedAfter = Number(roll.cutQtyPlanned) - Number(lay.theoreticalPieces);
          await tx.fabricRoll.update({
            where: { id: roll.id },
            data: {
              cutQtyPlanned: { decrement: Number(lay.theoreticalPieces) },
              ...(plannedAfter <= 0 && Number(roll.remainingLengthCm) > 0 ? { status: 'RESERVED' } : {}),
              version: { increment: 1 },
            },
          });
        }
        await this.rolls.rebuildSegments(tx as any, lay.rollId);
      },
      { timeout: 20000, maxWait: 10000 },
    );
    return this.getLayPlan(id);
  }

  // ── Cut operations ──────────────────────────────────────────────────────

  async listCutOperations(query: { layPlanId?: string; rollId?: string; page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {};
    if (query.layPlanId) where['layPlanId'] = query.layPlanId;
    if (query.rollId) where['rollId'] = query.rollId;
    const [items, total] = await Promise.all([
      this.prisma.client.cutOperation.findMany({
        where,
        orderBy: { createdOn: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          layPlan: {
            select: { id: true, number: true, ply: true, marker: { select: { number: true, styleRef: true } }, roll: { select: { number: true } } },
          },
        },
      }),
      this.prisma.client.cutOperation.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  /**
   * Record actual cutting results; writes the CONSUMED ledger entries.
   *
   * Every decision (already-recorded check, affordability vs remaining
   * fabric, the balance itself) happens INSIDE the transaction while the
   * roll row lock is held — parallel cuts on the same roll serialize, the
   * balance is always read fresh, and a double-cut of one lay is decided
   * by exactly one winner (proven by scripts/ledger-concurrency.mjs).
   */
  async completeCutOperation(layPlanId: string, dto: {
    actualLengthCm: number;
    actualPieces: number;
    rejectedPieces?: number;
    wasteLengthCm?: number;
    notes?: string;
  }) {
    if (dto.actualLengthCm == null || dto.actualLengthCm < 0) {
      throw new BadRequestException('Actual fabric used must be a non-negative number');
    }
    if (dto.actualPieces == null || dto.actualPieces < 0 || !Number.isInteger(dto.actualPieces)) {
      throw new BadRequestException('Actual cut pieces must be a non-negative whole number');
    }
    const waste = dto.wasteLengthCm ?? 0;
    if (waste < 0) throw new BadRequestException('Waste length must be non-negative');

    const ctx = getRequestContext();
    const number = await this.numbering.next('CT');
    const tenant = this.tenantId();

    await this.prisma.raw.$transaction(
      async (tx: any) => {
        // Serialize all ledger writers on this roll.
        await tx.$queryRaw`SELECT id FROM "FabricRoll" WHERE id = (SELECT "rollId" FROM "LayPlan" WHERE id = ${layPlanId}) FOR UPDATE`;

        // Re-read the lay under the lock — status may have changed.
        const lay = await tx.layPlan.findFirst({ where: { id: layPlanId } });
        if (!lay) throw new NotFoundException('Lay plan not found');
        if (lay.status === LayPlanStatus.COMPLETED) {
          throw new BadRequestException('Cutting for this lay is already recorded');
        }

        const roll = await tx.fabricRoll.findUnique({ where: { id: lay.rollId } });
        if (!roll) throw new NotFoundException('Fabric roll not found');

        const consumedTotal = round4(dto.actualLengthCm + waste);
        const remaining = Number(roll.remainingLengthCm);
        if (consumedTotal > remaining + 1e-6) {
          throw new BadRequestException(
            `Consumption (${consumedTotal} cm) exceeds the roll's remaining fabric (${remaining} cm)`,
          );
        }

        const startCm = Number(lay.markerStartCm);
        const endCm = round4(startCm + dto.actualLengthCm);
        const op = await tx.cutOperation.create({
          data: {
            tenantId: tenant,
            number,
            layPlanId: lay.id,
            rollId: lay.rollId,
            status: CutOperationStatus.COMPLETED,
            actualLengthCm: round4(dto.actualLengthCm),
            actualPieces: dto.actualPieces,
            rejectedPieces: dto.rejectedPieces ?? 0,
            wasteLengthCm: round4(waste),
            markerStartCm: startCm,
            markerEndCm: endCm,
            notes: dto.notes,
            createdBy: ctx?.userId ?? null,
            updatedBy: ctx?.userId ?? null,
          },
        });
        // Fresh, locked balance — never a stale read, never clamped.
        const balance = round4(remaining - consumedTotal);
        await tx.rollTransaction.create({
          data: {
            tenantId: tenant,
            rollId: lay.rollId,
            type: RollTransactionType.CONSUMED,
            quantityCm: -round4(dto.actualLengthCm),
            balanceAfterCm: balance,
            refType: 'cut-operation',
            refId: op.id,
            refLabel: `Cut ${op.number} — lay ${lay.number}`,
            createdBy: ctx?.userId ?? null,
          },
        });
        if (waste > 0) {
          await tx.rollTransaction.create({
            data: {
              tenantId: tenant,
              rollId: lay.rollId,
              type: RollTransactionType.WASTE,
              quantityCm: -round4(waste),
              balanceAfterCm: balance,
              refType: 'cut-operation',
              refId: op.id,
              refLabel: `Cut waste — lay ${lay.number}`,
              createdBy: ctx?.userId ?? null,
            },
          });
        }
        await tx.fabricRoll.update({
          where: { id: lay.rollId },
          data: {
            remainingLengthCm: balance,
            cutQtyActual: { increment: dto.actualPieces },
            status: balance <= 1e-6 ? 'CONSUMED' : undefined,
            version: { increment: 1 },
          },
        });
        await tx.layPlan.update({
          where: { id: lay.id },
          data: { status: LayPlanStatus.COMPLETED, updatedBy: ctx?.userId ?? null },
        });
        await this.rolls.rebuildSegments(tx as any, lay.rollId);
        await this.syncCutOrderStatus(tx as any, lay.cutOrderId);
      },
      { timeout: 20000, maxWait: 10000 },
    );
    return this.getLayPlan(layPlanId);
  }

  /** Cut order status follows its lays. */
  private async syncCutOrderStatus(tx: any, cutOrderId?: string | null) {
    if (!cutOrderId) return;
    const lays = await tx.layPlan.findMany({ where: { cutOrderId } });
    if (lays.length === 0) return;
    const allCompleted = lays.every((l: any) => l.status === LayPlanStatus.COMPLETED);
    const anyCompleted = lays.some((l: any) => l.status === LayPlanStatus.COMPLETED);
    const status = allCompleted
      ? CutOrderStatus.COMPLETED
      : anyCompleted
        ? CutOrderStatus.IN_PROGRESS
        : CutOrderStatus.APPROVED;
    await tx.cutOrder.update({ where: { id: cutOrderId }, data: { status, updatedBy: getRequestContext()?.userId ?? null } });
  }

  private async getOrderRow(id: string) {
    const order = await this.prisma.client.cutOrder.findFirst({ where: { id, isDeleted: false } });
    if (!order) throw new NotFoundException('Cut order not found');
    return order;
  }

  private tenantId(): string {
    const tid = getRequestContext()?.tenantId;
    if (!tid) throw new BadRequestException('Cutting operations require a tenant context');
    return tid;
  }
}
