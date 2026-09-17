import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DefectSeverity,
  FabricRollStatus,
  LengthUnit,
  RollTransactionType,
  SegmentType,
  buildSegmentPartition,
  round4,
  summarizeRoll,
  toBase,
} from '@fabriq/shared';
import { getRequestContext } from '@fabriq/database';
import { PrismaService } from '../../prisma/prisma.service';
import { parseListFilters, resolveListSort } from '../../common/list-filters';
import { NumberingService } from '../procurement/numbering.service';
import {
  AddMeasurementDto,
  AdjustmentDto,
  CreateDefectDto,
  CreateFabricRollDto,
  UpdateDefectDto,
  UpdateFabricRollDto,
} from './dto/fabric-roll.dto';

/** Minimal structural type for an interactive-transaction client. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SegmentTx = { fabricSegment: any; fabricRoll: any; fabricDefect: any; layPlan: any };

type RollRow = {
  id: string;
  number: string;
  tenantId: string;
  originalLengthCm: any;
  remainingLengthCm: any;
  widthCm: any;
  usableWidthCm: any;
  status: string;
  [key: string]: unknown;
};

/** Columns the rolls list endpoint accepts as filters / sort keys (whitelisted). */
const ROLL_FILTER_FIELDS = ['status', 'fabricName', 'fabricType', 'color', 'shadeLot'] as const;
const ROLL_SORTABLE_FIELDS = [
  'number',
  'fabricName',
  'fabricType',
  'color',
  'shadeLot',
  'gsm',
  'originalLengthCm',
  'remainingLengthCm',
  'widthCm',
  'usableWidthCm',
  'status',
  'createdOn',
  'updatedOn',
] as const;

/**
 * Fabric rolls: continuous material sources with a transaction ledger and
 * logical segments. Every material-moving mutation runs inside a transaction
 * that rewrites the affected segments and appends a RollTransaction row, so
 * remaining fabric can always be reconciled against the history.
 */
@Injectable()
export class FabricRollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────

  async list(query: {
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
    const filters = parseListFilters(query.filters, ROLL_FILTER_FIELDS);
    const where: Record<string, unknown> = { isDeleted: false, ...filters };
    if (query.status) where['status'] = query.status;
    if (query.search) {
      where['OR'] = ['number', 'fabricName', 'fabricType', 'color', 'shadeLot'].map((f) => ({
        [f]: { contains: query.search, mode: 'insensitive' },
      }));
    }
    const { orderBy } = resolveListSort(query.sortBy, query.sortOrder, {
      sortableFields: ROLL_SORTABLE_FIELDS,
      defaultSortBy: 'createdOn',
      defaultSortOrder: 'desc',
    });
    const [items, total] = await Promise.all([
      this.prisma.client.fabricRoll.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { defects: true, layPlans: true } },
        },
      }),
      this.prisma.client.fabricRoll.count({ where }),
    ]);
    return {
      items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string) {
    const roll = await this.prisma.client.fabricRoll.findFirst({
      where: { id, isDeleted: false },
      include: {
        measurements: { orderBy: { measuredOn: 'desc' } },
        defects: { where: { isDeleted: false }, orderBy: { startCm: 'asc' } },
        transactions: { orderBy: { createdOn: 'asc' } },
        segments: { orderBy: { startCm: 'asc' } },
        _count: { select: { layPlans: true } },
      },
    });
    if (!roll) throw new NotFoundException('Fabric roll not found');
    return roll;
  }

  async create(dto: CreateFabricRollDto) {
    const lengthUnit = dto.lengthUnit ?? LengthUnit.METERS;
    const widthUnit = dto.widthUnit ?? LengthUnit.INCHES;
    const originalLengthCm = round4(toBase(dto.length, lengthUnit));
    const widthCm = round4(toBase(dto.width, widthUnit));
    const usableWidthCm = round4(
      dto.usableWidth != null ? toBase(dto.usableWidth, widthUnit) : widthCm,
    );
    if (usableWidthCm > widthCm + 1e-6) {
      throw new BadRequestException('Usable width cannot exceed the nominal roll width');
    }
    if (originalLengthCm <= 0 || widthCm <= 0) {
      throw new BadRequestException('Roll length and width must be greater than zero');
    }
    const number = dto.number?.trim() || (await this.numbering.next('R'));
    const ctx = getRequestContext();
    const roll = await this.prisma.raw.fabricRoll.create({
      data: {
        tenantId: this.tenantId(),
        number,
        fabricName: dto.fabricName,
        fabricType: dto.fabricType,
        color: dto.color,
        shadeLot: dto.shadeLot,
        supplierRef: dto.supplierRef,
        grnRollId: dto.grnRollId,
        gsm: dto.gsm,
        originalLengthCm,
        remainingLengthCm: originalLengthCm,
        widthCm,
        usableWidthCm,
        weightKg: dto.weightKg,
        lengthUnit,
        widthUnit,
        status: FabricRollStatus.IN_STOCK,
        notes: dto.notes,
        createdBy: ctx?.userId ?? null,
        updatedBy: ctx?.userId ?? null,
        segments: {
          create: {
            tenantId: this.tenantId(),
            startCm: 0,
            endCm: originalLengthCm,
            type: SegmentType.AVAILABLE,
            label: 'Full roll',
          },
        },
      },
    });
    return this.getById(roll.id);
  }

  /**
   * Creates a cutting-room FabricRoll straight from an inspected GRN roll —
   * the procurement → cutting hand-off with no manual re-entry. The caller
   * (warehouse-receipt service) runs this inside its own transaction, so no
   * transaction is opened here.
   *
   * Unit conventions (matching the GRN capture form): roll length is meters,
   * roll width is inches (the FabricRoll width display default). Derived
   * state (remaining, segment, ledger-free) is identical to create(): a full
   * AVAILABLE segment spanning the original length, status IN_STOCK.
   */
  async createFromGrnRoll(
    grnRoll: {
      id: string;
      rollNumber: string;
      fabricType?: string | null;
      color?: string | null;
      gsm?: unknown;
      width?: unknown;
      length?: unknown;
      weight?: unknown;
      batch?: string | null;
      lot?: string | null;
      condition?: string | null;
    },
    opts: {
      /** Supplier name/code stamped as supplierRef. */
      supplierRef?: string;
      /** Who to attribute the roll to (defaults to the request context user). */
      userId?: string;
    } = {},
    /** Optional interactive-transaction client from the caller. */
    tx?: { fabricRoll: any },
  ): Promise<string> {
    const widthUnit = LengthUnit.INCHES;
    const widthCm = round4(toBase(Number(grnRoll.width ?? 0), widthUnit));
    const originalLengthCm = round4(toBase(Number(grnRoll.length ?? 0), LengthUnit.METERS));
    if (originalLengthCm <= 0) {
      throw new BadRequestException(
        `GRN roll "${grnRoll.rollNumber}" has no usable length — record a length before receiving it`,
     );
    }
    if (widthCm <= 0) {
      throw new BadRequestException(
        `GRN roll "${grnRoll.rollNumber}" has no usable width — record a width before receiving it`,
      );
    }
    const number = await this.numbering.next('R');
    const ctx = getRequestContext();
    const createdBy = opts.userId ?? ctx?.userId ?? null;
    const client = tx ?? this.prisma.raw;
    const roll = await client.fabricRoll.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        tenantId: this.tenantId(),
        number,
        grnRollId: grnRoll.id,
        fabricName: grnRoll.fabricType,
        fabricType: grnRoll.fabricType,
        color: grnRoll.color,
        shadeLot: grnRoll.lot,
        supplierRef: opts.supplierRef ?? null,
        gsm: grnRoll.gsm != null ? Number(grnRoll.gsm) : null,
        originalLengthCm,
        remainingLengthCm: originalLengthCm,
        widthCm,
        usableWidthCm: widthCm,
        weightKg: grnRoll.weight != null ? Number(grnRoll.weight) : null,
        lengthUnit: LengthUnit.METERS,
        widthUnit,
        status: FabricRollStatus.IN_STOCK,
        notes:
          grnRoll.condition && grnRoll.condition !== 'GOOD'
            ? `Received via GRN (condition: ${grnRoll.condition}).`
            : 'Received via GRN.',
        createdBy,
        updatedBy: createdBy,
        segments: {
          create: {
            tenantId: this.tenantId(),
            startCm: 0,
            endCm: originalLengthCm,
            type: SegmentType.AVAILABLE,
            label: 'Full roll',
          },
        },
      } as any,
    });
    return roll.id;
  }

  async update(id: string, dto: UpdateFabricRollDto) {
    const roll = await this.getRollRow(id);
    const data: Record<string, unknown> = {
      updatedBy: getRequestContext()?.userId ?? null,
      version: { increment: 1 },
    };

    // Identity fields pass through.
    for (const key of ['fabricName', 'fabricType', 'color', 'shadeLot', 'supplierRef', 'gsm', 'notes', 'grnRollId'] as const) {
      if (dto[key] !== undefined) data[key] = dto[key];
    }
    if (dto.status !== undefined) data['status'] = dto.status;

    // Widths and length are unit-aware updates: an explicitly provided unit
    // wins; otherwise the roll's stored display unit is used.
    const widthUnit = dto.widthUnit ?? (roll.widthUnit as LengthUnit);
    const lengthUnit = dto.lengthUnit ?? (roll.lengthUnit as LengthUnit);
    if (dto.width != null) data['widthCm'] = round4(toBase(dto.width, widthUnit));
    if (dto.usableWidth != null) data['usableWidthCm'] = round4(toBase(dto.usableWidth, widthUnit));
    if (dto.length != null) data['originalLengthCm'] = round4(toBase(dto.length, lengthUnit));
    if (dto.weightKg !== undefined) data['weightKg'] = dto.weightKg;

    if (data['widthCm'] != null && data['usableWidthCm'] == null && dto.usableWidth == null) {
      // Width changed without an explicit usable width — keep the old usable
      // value unless it now exceeds the new nominal width.
      const currentUsable = Number(roll.usableWidthCm);
      if (Number(data['widthCm']) >= currentUsable) {
        data['usableWidthCm'] = currentUsable;
      } else {
        data['usableWidthCm'] = data['widthCm'];
      }
    }
    if (
      data['usableWidthCm'] != null &&
      Number(data['widthCm'] ?? roll.widthCm) < Number(data['usableWidthCm'])
    ) {
      throw new BadRequestException('Usable width cannot exceed the nominal roll width');
    }

    await this.prisma.raw.fabricRoll.update({ where: { id }, data: data as any });
    return this.getById(id);
  }

  async archive(id: string) {
    await this.getRollRow(id);
    const layCount = await this.prisma.client.layPlan.count({ where: { rollId: id } });
    if (layCount > 0) {
      throw new BadRequestException('Roll has lay plans and cannot be archived');
    }
    return this.prisma.raw.fabricRoll.update({
      where: { id },
      data: { isDeleted: true, deletedOn: new Date(), deletedBy: getRequestContext()?.userId ?? null },
    });
  }

  // ── Measurements ────────────────────────────────────────────────────────

  async addMeasurement(rollId: string, dto: AddMeasurementDto) {
    const roll = await this.getRollRow(rollId);
    const widthCm = Number(roll.widthCm);
    const readings = [dto.beginWidth, dto.middleWidth, dto.endWidth, ...(dto.extraWidths ?? []).map((w) => w.value)]
      .filter((v): v is number => v != null)
      .map((v) => round4(toBase(v, roll.widthUnit as LengthUnit)));
    for (const r of readings) {
      if (r > widthCm + 1e-6) {
        throw new BadRequestException('A width reading exceeds the nominal roll width');
      }
    }
    const usableWidthCm = round4(toBase(dto.usableWidth, roll.widthUnit as LengthUnit));
    if (usableWidthCm > widthCm + 1e-6) {
      throw new BadRequestException('Usable width cannot exceed the nominal roll width');
    }
    const lengthCm = round4(toBase(dto.length, roll.lengthUnit as LengthUnit));
    const minWidth = readings.length ? round4(Math.min(...readings)) : null;
    const maxWidth = readings.length ? round4(Math.max(...readings)) : null;
    const avgWidth = readings.length ? round4(readings.reduce((s, v) => s + v, 0) / readings.length) : null;

    const ctx = getRequestContext();
    const result = await this.prisma.raw.$transaction(async (tx: any) => {
      const measurement = await tx.fabricMeasurement.create({
        data: {
          tenantId: this.tenantId(),
          rollId,
          measuredBy: ctx?.userId ?? null,
          lengthCm,
          beginWidthCm: dto.beginWidth != null ? round4(toBase(dto.beginWidth, roll.widthUnit as LengthUnit)) : null,
          middleWidthCm: dto.middleWidth != null ? round4(toBase(dto.middleWidth, roll.widthUnit as LengthUnit)) : null,
          endWidthCm: dto.endWidth != null ? round4(toBase(dto.endWidth, roll.widthUnit as LengthUnit)) : null,
          minWidthCm: minWidth,
          maxWidthCm: maxWidth,
          avgWidthCm: avgWidth,
          usableWidthCm,
          note: dto.note,
          createdBy: ctx?.userId ?? null,
        },
      });
      await tx.fabricRoll.update({
        where: { id: rollId },
        data: {
          minWidthCm: minWidth,
          maxWidthCm: maxWidth,
          avgWidthCm: avgWidth,
          usableWidthCm,
          measurementNote: dto.note ?? null,
          status: FabricRollStatus.IN_STOCK,
          updatedBy: ctx?.userId ?? null,
          version: { increment: 1 },
        },
      });
      await tx.rollTransaction.create({
        data: {
          tenantId: this.tenantId(),
          rollId,
          type: RollTransactionType.MEASURED,
          quantityCm: 0,
          balanceAfterCm: Number(roll.remainingLengthCm),
          refType: 'measurement',
          refId: measurement.id,
          refLabel: `Measured ${dto.length} ${roll.lengthUnit}`,
          createdBy: ctx?.userId ?? null,
        },
      });
      return measurement;
    });
    return result;
  }

  // ── Defects ─────────────────────────────────────────────────────────────

  async addDefect(rollId: string, dto: CreateDefectDto) {
    const roll = await this.getRollRow(rollId);
    const start = round4(dto.startCm);
    const end = round4(dto.endCm);
    if (end <= start) throw new BadRequestException('Defect end must be after its start');
    if (end > Number(roll.originalLengthCm) + 1e-6) {
      throw new BadRequestException('Defect extends past the end of the roll');
    }
    const count = await this.prisma.client.fabricDefect.count({ where: { rollId } });
    const ctx = getRequestContext();
    return this.prisma.raw.$transaction(async (tx: any) => {
      const defect = await tx.fabricDefect.create({
        data: {
          tenantId: this.tenantId(),
          rollId,
          code: `D-${count + 1}`,
          defectType: dto.defectType ?? 'OTHER',
          startCm: start,
          endCm: end,
          affectedWidthCm: dto.affectedWidthCm ?? 0,
          severity: dto.severity ?? DefectSeverity.MINOR,
          notes: dto.notes,
          createdBy: ctx?.userId ?? null,
          updatedBy: ctx?.userId ?? null,
        },
      });
      // Split segments around the defect (defect fabric stays on the roll —
      // it is excluded from planning, not removed).
      await this.splitSegments(tx, rollId, start, end, SegmentType.DEFECT, 'defect', defect.id, `Defect ${defect.code}`);
      await tx.rollTransaction.create({
        data: {
          tenantId: this.tenantId(),
          rollId,
          type: RollTransactionType.DEFECT_MARKED,
          quantityCm: 0,
          balanceAfterCm: Number(roll.remainingLengthCm),
          refType: 'defect',
          refId: defect.id,
          refLabel: `Defect ${defect.code} (${round4(end - start)} cm)`,
          createdBy: ctx?.userId ?? null,
        },
      });
      return defect;
    });
  }

  async updateDefect(rollId: string, defectId: string, dto: UpdateDefectDto) {
    const roll = await this.getRollRow(rollId);
    const defect = await this.prisma.client.fabricDefect.findFirst({ where: { id: defectId, rollId } });
    if (!defect) throw new NotFoundException('Defect not found');
    const start = dto.startCm != null ? round4(dto.startCm) : Number(defect.startCm);
    const end = dto.endCm != null ? round4(dto.endCm) : Number(defect.endCm);
    if (end <= start) throw new BadRequestException('Defect end must be after its start');

    return this.prisma.raw.$transaction(async (tx: any) => {
      const updated = await tx.fabricDefect.update({
        where: { id: defectId },
        data: {
          ...(dto.defectType !== undefined ? { defectType: dto.defectType } : {}),
          ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.affectedWidthCm !== undefined ? { affectedWidthCm: dto.affectedWidthCm } : {}),
          startCm: start,
          endCm: end,
          updatedBy: getRequestContext()?.userId ?? null,
          version: { increment: 1 },
        },
      });
      await this.rebuildSegments(tx, rollId);
      return updated;
    });
  }

  async archiveDefect(rollId: string, defectId: string) {
    await this.getRollRow(rollId);
    const defect = await this.prisma.client.fabricDefect.findFirst({ where: { id: defectId, rollId } });
    if (!defect) throw new NotFoundException('Defect not found');
    await this.prisma.raw.fabricDefect.update({
      where: { id: defectId },
      data: { isDeleted: true, deletedOn: new Date(), deletedBy: getRequestContext()?.userId ?? null },
    });
    await this.rebuildSegments(this.prisma.raw, rollId);
    return { archived: true };
  }

  // ── Manual adjustments (never silently overwrite the ledger) ────────────

  async adjust(rollId: string, dto: AdjustmentDto) {
    const roll = await this.getRollRow(rollId);
    if (dto.quantityCm === 0) throw new BadRequestException('Adjustment must be non-zero');
    const current = Number(roll.remainingLengthCm);
    if (dto.quantityCm < 0 && current + dto.quantityCm < 0) {
      throw new BadRequestException('Adjustment would make remaining fabric negative');
    }
    const ctx = getRequestContext();
    return this.prisma.raw.$transaction(async (tx: any) => {
      const balance = round4(current + dto.quantityCm);
      await tx.fabricRoll.update({
        where: { id: rollId },
        data: { remainingLengthCm: balance, updatedBy: ctx?.userId ?? null, version: { increment: 1 } },
      });
      const txn = await tx.rollTransaction.create({
        data: {
          tenantId: this.tenantId(),
          rollId,
          type: RollTransactionType.ADJUSTMENT,
          quantityCm: round4(dto.quantityCm),
          balanceAfterCm: balance,
          refType: 'adjustment',
          refLabel: dto.note ?? 'Manual adjustment',
          createdBy: ctx?.userId ?? null,
        },
      });
      await this.rebuildSegments(tx, rollId);
      return txn;
    });
  }

  /**
   * Close-out: cut the roll's remaining usable fabric off as a REMNANT.
   *
   * Rules (§7/§8 of the spec):
   *  • distinct states — remaining roll (still attached) vs remnant
   *    (physically separated) vs waste (unusable) are never mixed: this
   *    operation is the ONLY thing that turns remaining fabric into a
   *    remnant, and it writes a REMNANT ledger row for the history.
   *  • the roll must be settled: active (PLANNED / IN_PROGRESS) lay plans
   *    block close-out; completed lays and defects are fine.
   *  • the leftover must be one contiguous AVAILABLE span — physically you
   *    can only cut one piece off; disconnected spans must be consumed or
   *    written off first.
   *  • default length = the whole leftover span; a smaller `lengthCm` cuts a
   *    shorter remnant and leaves the rest on the (still open) roll.
   *  • the roll closes (status CLOSED) exactly when its remaining fabric
   *    reaches zero; the ledger row preserves the parent-roll history.
   */
  async closeRoll(rollId: string, dto: { lengthCm?: number; location?: string; notes?: string }) {
    const roll = await this.getRollRow(rollId);
    const ctx = getRequestContext();
    const remnant = await this.prisma.raw.$transaction(
      async (tx: any) => {
        // Serialize against lay/cut ledger writers.
        await tx.$queryRaw`SELECT id FROM "FabricRoll" WHERE id = ${rollId} FOR UPDATE`;
        // Remnant-sourced lays hold piece fabric, not the parent's remaining
        // spans — they don't block converting the leftover into a remnant.
        const activeLays = await tx.layPlan.count({
          where: { rollId, status: { in: ['PLANNED', 'IN_PROGRESS'] }, remnantId: null },
        });
        if (activeLays > 0) {
          throw new BadRequestException('Roll has active lay plans — cancel or complete them before closing');
        }
        const available = await tx.fabricSegment.findMany({
          where: { rollId, type: SegmentType.AVAILABLE },
          orderBy: { startCm: 'asc' },
        });
        if (available.length === 0) {
          throw new BadRequestException('Roll has no available fabric left to convert into a remnant');
        }
        const remaining = Number(roll.remainingLengthCm);
        if (remaining <= 1e-6) {
          throw new BadRequestException('Roll has no remaining fabric in the ledger to convert into a remnant');
        }
        const firstStart = Number(available[0].startCm);
        const lastEnd = Number(available[available.length - 1].endCm);
        const largestSpan = Math.max(...available.map((s: any) => Number(s.endCm) - Number(s.startCm)));
        // The LEDGER is authoritative for the balance; segments are the
        // physical picture. A full close converts the ledger remaining and
        // covers every AVAILABLE span (absorbing any ledger/segment delta,
        // e.g. waste recorded outside consumed spans). A partial close cuts
        // a contiguous piece off the END of the last AVAILABLE span.
        let lengthCm: number;
        let cutStart: number;
        let cutEnd: number;
        if (dto.lengthCm != null) {
          lengthCm = round4(dto.lengthCm);
          if (lengthCm <= 0) throw new BadRequestException('Remnant length must be greater than zero');
          if (lengthCm > largestSpan + 1e-6) {
            throw new BadRequestException(
              `Remnant length (${lengthCm} cm) exceeds the largest available span (${round4(largestSpan)} cm)`,
            );
          }
          cutEnd = lastEnd;
          cutStart = round4(cutEnd - lengthCm);
        } else {
          lengthCm = round4(remaining);
          cutStart = firstStart;
          cutEnd = Number(roll.originalLengthCm);
        }
        const number = await this.numbering.next('RM');
        const created = await tx.remnant.create({
          data: {
            tenantId: this.tenantId(),
            number,
            sourceRollId: rollId,
            sourceStartCm: cutStart,
            sourceEndCm: cutEnd,
            lengthCm,
            widthCm: roll.widthCm,
            usableWidthCm: roll.usableWidthCm,
            status: 'AVAILABLE',
            location: dto.location,
            fabricName: roll.fabricName,
            fabricType: roll.fabricType,
            color: roll.color,
            shadeLot: roll.shadeLot,
            gsm: roll.gsm,
            notes: dto.notes,
            createdBy: ctx?.userId ?? null,
            updatedBy: ctx?.userId ?? null,
          },
        });
        const balance = round4(remaining - lengthCm);
        await tx.rollTransaction.create({
          data: {
            tenantId: this.tenantId(),
            rollId,
            type: RollTransactionType.REMNANT,
            quantityCm: -lengthCm,
            balanceAfterCm: balance,
            refType: 'remnant',
            refId: created.id,
            refLabel: `Remnant ${number} cut from the roll`,
            note: dto.notes,
            createdBy: ctx?.userId ?? null,
          },
        });
        await tx.fabricRoll.update({
          where: { id: rollId },
          data: {
            remainingLengthCm: balance,
            ...(balance <= 1e-6 ? { status: FabricRollStatus.CLOSED } : {}),
            updatedBy: ctx?.userId ?? null,
            version: { increment: 1 },
          },
        });
        await this.rebuildSegments(tx, rollId);
        return created;
      },
      { timeout: 20000, maxWait: 10000 },
    );
    return { remnant, roll: await this.getById(rollId) };
  }

  /** Summary for the detail header (uses the shared calculation engine). */
  async summary(rollId: string) {
    const roll = await this.getRollRow(rollId);
    const transactions = await this.prisma.client.rollTransaction.findMany({
      where: { rollId },
      orderBy: { createdOn: 'asc' },
    });
    const defectAgg = await this.prisma.client.fabricDefect.aggregate({
      where: { rollId, isDeleted: false },
      _sum: { endCm: true, startCm: true },
      _count: true,
    });
    // Per-defect span totals:
    const defects = await this.prisma.client.fabricDefect.findMany({
      where: { rollId, isDeleted: false },
      select: { startCm: true, endCm: true },
    });
    const defectLengthCm = defects.reduce((s: number, d: any) => s + (Number(d.endCm) - Number(d.startCm)), 0);
    void defectAgg;
    return summarizeRoll({
      originalLengthCm: Number(roll.originalLengthCm),
      ledger: transactions.map((t) => ({
        type: t.type,
        quantityCm: Number(t.quantityCm),
        refType: t.refType,
        refId: t.refId,
        refLabel: t.refLabel,
        createdOn: t.createdOn,
      })),
      defectLengthCm,
    });
  }

  // ── segment engine (internal) ───────────────────────────────────────────

  /**
   * Rebuilds the segment partition from roll length + defects + lay-plan
   * reservations/consumption. Idempotent — used after any mutation.
   * (Shared with the production service, which runs it inside its own
   * transactions after reserving/consuming lay spans.)
   */
  async rebuildSegments(tx: SegmentTx, rollId: string) {
    const roll = await tx.fabricRoll.findUnique({ where: { id: rollId } });
    if (!roll) return;
    const [defects, lays, remnants] = await Promise.all([
      tx.fabricDefect.findMany({ where: { rollId, isDeleted: false }, orderBy: { startCm: 'asc' } }),
      tx.layPlan.findMany({
        where: { rollId, status: { in: ['PLANNED', 'IN_PROGRESS', 'COMPLETED'] } },
        orderBy: { markerStartCm: 'asc' },
        include: { cutOperations: { where: { status: 'COMPLETED' } } },
      }),
      // Remnants created by close-out — REMNANT spans on the parent timeline.
      // (No `remnants` relation delegate on the tx type; query the model directly.)
      (tx as any).remnant.findMany({ where: { sourceRollId: rollId, isDeleted: false } }),
    ]);
    const rows = buildSegmentPartition({
      totalCm: Number(roll.originalLengthCm),
      defects: defects.map((d: any) => ({ id: d.id, code: d.code, startCm: Number(d.startCm), endCm: Number(d.endCm) })),
      lays: lays.map((lay: any) => {
        const s = Number(lay.markerStartCm);
        const e = Math.min(s + Number(lay.markerLengthCm), Number(roll.originalLengthCm));
        return { id: lay.id, startCm: s, endCm: e, completed: lay.cutOperations.length > 0 };
      }),
      remnants: remnants.map((r: any) => ({
        id: r.id,
        number: r.number,
        startCm: Number(r.sourceStartCm),
        endCm: Number(r.sourceEndCm),
      })),
    });

    await tx.fabricSegment.deleteMany({ where: { rollId } });
    if (rows.length) {
      await tx.fabricSegment.createMany({
        data: rows.map((r) => ({
          tenantId: this.tenantId(),
          rollId,
          startCm: r.startCm,
          endCm: r.endCm,
          type: r.type,
          refType: r.refType,
          refId: r.refId,
          label: r.label,
        })),
      });
    }
  }

  /** Carve [start,end] out of AVAILABLE segments and insert the new span. */
  private async splitSegments(
    tx: SegmentTx,
    rollId: string,
    start: number,
    end: number,
    type: SegmentType,
    refType: string,
    refId: string,
    label: string,
  ) {
    const segments = await tx.fabricSegment.findMany({ where: { rollId }, orderBy: { startCm: 'asc' } });
    const replace: Array<{ id?: string; startCm: number; endCm: number; type: SegmentType; refType?: string; refId?: string; label?: string }> = [];
    for (const seg of segments) {
      const s = Number(seg.startCm);
      const e = Number(seg.endCm);
      if (e <= start + 1e-6 || s >= end - 1e-6) {
        replace.push({ id: seg.id, startCm: s, endCm: e, type: seg.type as SegmentType, refType: seg.refType ?? undefined, refId: seg.refId ?? undefined, label: seg.label ?? undefined });
        continue;
      }
      // Overlaps [start, end]: keep the untouched pieces.
      if (s < start - 1e-6) replace.push({ id: seg.id, startCm: s, endCm: start, type: seg.type as SegmentType, refType: seg.refType ?? undefined, refId: seg.refId ?? undefined, label: seg.label ?? undefined });
      if (e > end + 1e-6) replace.push({ startCm: end, endCm: e, type: seg.type as SegmentType, refType: seg.refType ?? undefined, refId: seg.refId ?? undefined, label: seg.label ?? undefined });
    }
    replace.push({ startCm: start, endCm: end, type, refType, refId, label });
    replace.sort((a, b) => a.startCm - b.startCm);
    await tx.fabricSegment.deleteMany({ where: { rollId } });
    await tx.fabricSegment.createMany({
      data: replace.map((r) => ({
        tenantId: this.tenantId(),
        rollId,
        startCm: r.startCm,
        endCm: r.endCm,
        type: r.type,
        refType: r.refType,
        refId: r.refId,
        label: r.label,
      })),
    });
  }

  /** Same as splitSegments but converts a lay span into CONSUMED. */
  async consumeSegment(rollId: string, start: number, end: number, refId: string, label: string) {
    return this.splitSegments(
      this.prisma.raw,
      rollId,
      start,
      end,
      SegmentType.CONSUMED,
      'lay-plan',
      refId,
      label,
    );
  }

  private async getRollRow(id: string): Promise<RollRow> {
    const roll = await this.prisma.client.fabricRoll.findFirst({
      where: { id, isDeleted: false },
    });
    if (!roll) throw new NotFoundException('Fabric roll not found');
    return roll as unknown as RollRow;
  }

  private tenantId(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tid = getRequestContext()?.tenantId;
    if (!tid) throw new BadRequestException('Cutting operations require a tenant context');
    return tid;
  }
}
