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
  round4,
  summarizeRoll,
  toBase,
} from '@fabriq/shared';
import { getRequestContext } from '@fabriq/database';
import { PrismaService } from '../../prisma/prisma.service';
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

  async list(query: { search?: string; status?: string; page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = { isDeleted: false };
    if (query.status) where['status'] = query.status;
    if (query.search) {
      where['OR'] = ['number', 'fabricName', 'fabricType', 'color', 'shadeLot'].map((f) => ({
        [f]: { contains: query.search, mode: 'insensitive' },
      }));
    }
    const [items, total] = await Promise.all([
      this.prisma.client.fabricRoll.findMany({
        where,
        orderBy: { createdOn: 'desc' },
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
    const [defects, lays] = await Promise.all([
      tx.fabricDefect.findMany({ where: { rollId, isDeleted: false }, orderBy: { startCm: 'asc' } }),
      tx.layPlan.findMany({
        where: { rollId, status: { in: ['PLANNED', 'IN_PROGRESS', 'COMPLETED'] } },
        orderBy: { markerStartCm: 'asc' },
        include: { cutOperations: { where: { status: 'COMPLETED' } } },
      }),
    ]);
    const rows: Array<{ startCm: number; endCm: number; type: SegmentType; refType?: string; refId?: string; label?: string }> = [];
    const total = Number(roll.originalLengthCm);
    const push = (start: number, end: number, type: SegmentType, refType?: string, refId?: string, label?: string) => {
      if (end - start <= 1e-6) return;
      rows.push({ startCm: round4(start), endCm: round4(end), type, refType, refId, label });
    };

    const laySegmentTypes = new Map<string, SegmentType>();
    const laySpans = new Map<string, { start: number; end: number }>();
    // Cut points collect every boundary event.
    const events = new Set<number>([0, total]);
    for (const d of defects) {
      events.add(Number(d.startCm));
      events.add(Math.min(Number(d.endCm), total));
    }
    for (const lay of lays) {
      const s = Number(lay.markerStartCm);
      const e = Math.min(s + Number(lay.markerLengthCm), total);
      const completed = lay.cutOperations.length > 0;
      if (e > s) {
        events.add(Math.max(0, s));
        events.add(e);
        laySegmentTypes.set(lay.id, completed ? SegmentType.CONSUMED : SegmentType.RESERVED);
        laySpans.set(lay.id, { start: s, end: e });
      }
    }

    const sorted = [...events].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const s = sorted[i];
      const e = sorted[i + 1];
      if (e - s <= 1e-6) continue;
      const defect = defects.find((d: any) => Number(d.startCm) <= s + 1e-6 && Number(d.endCm) >= e - 1e-6);
      const lay = [...laySpans.entries()].find(
        ([, span]) => span.start <= s + 1e-6 && span.end >= e - 1e-6,
      );
      if (lay) {
        const [layId, span] = lay;
        push(s, e, laySegmentTypes.get(layId) ?? SegmentType.RESERVED, 'lay-plan', layId, `Lay ${layId.slice(0, 8)}`);
      } else if (defect) {
        push(s, e, SegmentType.DEFECT, 'defect', defect.id, `Defect ${defect.code}`);
      } else {
        push(s, e, SegmentType.AVAILABLE);
      }
    }

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
