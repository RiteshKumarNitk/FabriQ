import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LengthUnit, scoreFourPoint, toBase } from '@fabriq/shared';
import { getRequestContext } from '@fabriq/database';
import { PrismaService } from '../../../prisma/prisma.service';
import { ListQueryDto } from '../../../common/pagination.dto';
import { buildListArgs, buildPaginationMeta } from '../../../common/list-args';
import { NumberingService } from '../numbering.service';
import { CreateInspectionDto, UpdateInspectionDto } from './dto/inspection.dto';

/**
 * 4-point fabric inspection — scoring is delegated to the shared verified
 * engine (@fabriq/shared `scoreFourPoint`): size-based point assignment
 * (≤3" → 1, ≤6" → 2, ≤9" → 3, else 4; holes always 4), WIDTH-normalized
 * points per 100 m² as the decision basis (≤15 APPROVED, ≤30 SECOND_QUALITY,
 * else REJECTED), and the classic linear pts/100 m kept for reporting.
 * Explicit inspector points are honored (clamped 1–4). The decision can be
 * overridden explicitly; only APPROVED / SECOND_QUALITY rolls become
 * eligible for warehouse receipt.
 */
@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
  ) {}

  /** Rolls awaiting inspection (for the create-form picker). */
  async pendingRolls() {
    return this.prisma.client.grnRoll.findMany({
      where: { status: 'PENDING_INSPECTION' },
      orderBy: { createdOn: 'asc' },
      include: {
        grn: {
          select: { id: true, number: true, receivedDate: true },
        },
        purchaseOrderItem: { select: { id: true, itemName: true } },
      },
    });
  }

  async list(dto: ListQueryDto) {
    const args = buildListArgs(dto, {
      searchFields: ['number', 'remarks'],
      where: { isDeleted: false },
      defaultSortBy: 'createdOn',
    });
    const [items, total] = await Promise.all([
      this.prisma.client.fabricInspection.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        include: {
        grnRoll: {
          // length/width feed the live 4-point preview in the inspection form
          // (the server always re-scores authoritatively on save).
          select: { id: true, rollNumber: true, fabricType: true, color: true, length: true, width: true, grn: { select: { number: true } } },
        },
          inspector: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { defects: true } },
        },
      }),
      this.prisma.client.fabricInspection.count({ where: args.where }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }

  async getById(id: string) {
    const doc = await this.prisma.client.fabricInspection.findFirst({
      where: { id, isDeleted: false },
      include: {
        grnRoll: {
          include: {
            grn: { select: { id: true, number: true, receivedDate: true } },
            purchaseOrderItem: { select: { id: true, itemName: true } },
          },
        },
        inspector: { select: { id: true, firstName: true, lastName: true, email: true } },
        defects: { orderBy: { createdOn: 'asc' } },
      },
    });
    if (!doc) throw new NotFoundException('Fabric inspection not found');
    return doc;
  }

  async create(dto: CreateInspectionDto) {
    const roll = await this.prisma.client.grnRoll.findFirst({
      where: { id: dto.grnRollId },
      include: { inspection: true },
    });
    if (!roll) throw new NotFoundException('Roll not found');
    if (roll.inspection) {
      throw new BadRequestException('This roll has already been inspected');
    }
    const { grnRollId, inspectorId, defects, ...header } = dto;
    const { totalPoints, pointsPer100m, qualityScore } = this.score(defects ?? [], roll);
    const decision = dto.decision ?? this.decide(pointsPer100m);
    const number = await this.numbering.next('INSP');
    const inspection = await this.raw.fabricInspection.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        ...header,
        number,
        tenantId: this.ctxTenant(),
        grnRollId,
        inspectorId: inspectorId ?? this.ctx?.userId ?? null,
        inspectionDate: dto.inspectionDate ? new Date(dto.inspectionDate) : new Date(),
        decision: decision as any,
        totalPoints,
        qualityScore,
        pointsPer100m,
        createdBy: this.ctx?.userId ?? null,
        updatedBy: this.ctx?.userId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        defects: { create: (defects ?? []).map((d) => ({ ...d, tenantId: this.ctxTenant() }) as any) },
      } as any,
    });
    await this.applyRollStatus(dto.grnRollId, decision);
    return this.getById(inspection.id);
  }

  async update(id: string, dto: UpdateInspectionDto) {
    const existing = await this.getById(id);
    const { defects, grnRollId, inspectorId, ...header } = dto;
    const defectsToScore = defects ?? existing.defects;
    const { totalPoints, pointsPer100m, qualityScore } = this.score(defectsToScore as any[], existing.grnRoll);
    const decision = dto.decision ?? this.decide(pointsPer100m);
    await this.raw.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.fabricInspection.update({
        where: { id },
        data: {
          ...header,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          decision: decision as any,
          totalPoints,
          pointsPer100m,
          qualityScore,
          ...(grnRollId ? { grnRollId } : {}),
          ...(inspectorId ? { inspectorId } : {}),
          ...(dto.inspectionDate ? { inspectionDate: new Date(dto.inspectionDate) } : {}),
          updatedBy: this.ctx?.userId ?? null,
          version: { increment: 1 },
        } as any,
      });
      if (defects) {
        await tx.fabricInspectionDefect.deleteMany({ where: { inspectionId: id } });
        await tx.fabricInspectionDefect.createMany({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: defects.map((d) => ({ ...d, inspectionId: id, tenantId: this.ctxTenant() }) as any),
        });
      }
    });
    await this.applyRollStatus(existing.grnRollId, decision);
    return this.getById(id);
  }

  async archive(id: string) {
    const doc = await this.getById(id);
    // Reset the roll to pending when its inspection is removed.
    await this.raw.grnRoll.update({
      where: { id: doc.grnRollId },
      data: { status: 'PENDING_INSPECTION' },
    });
    return this.raw.fabricInspection.update({
      where: { id },
      data: { isDeleted: true, deletedBy: this.ctx?.userId ?? null, deletedOn: new Date() },
    });
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  /**
   * Verified 4-point scoring via the shared engine. Length comes from the
   * GRN roll in meters; the roll width (inches per the GRN capture form)
   * feeds the width normalization. `pointsPer100m` stores the DECISION
   * basis (points per 100 m²) and `qualityScore` the derived quality %.
   */
  private score(
    defects: Array<{ sizeCm?: unknown; defectType?: unknown; points?: unknown }>,
    roll: { length?: unknown; width?: unknown },
  ) {
    const lengthMeters = Number(roll.length ?? 0);
    const widthCm = roll.width != null ? toBase(Number(roll.width), LengthUnit.INCHES) : null;
    const result = scoreFourPoint({
      defects: (defects ?? []).map((d) => ({
        size: d.sizeCm != null ? Number(d.sizeCm) : null,
        sizeUnit: LengthUnit.CM,
        points: d.points != null ? Number(d.points) : null,
        defectType: d.defectType != null ? String(d.defectType) : null,
      })),
      lengthMeters,
      widthCm,
    });
    return {
      totalPoints: result.totalPoints,
      pointsPer100m: result.pointsPer100SqMeters,
      qualityScore: result.qualityPct,
    };
  }

  private decide(pointsPer100m: number): string {
    if (pointsPer100m <= 15) return 'APPROVED';
    if (pointsPer100m <= 30) return 'SECOND_QUALITY';
    return 'REJECTED';
  }

  private async applyRollStatus(rollId: string, decision: string) {
    const status =
      decision === 'REJECTED'
        ? 'REJECTED'
        : decision === 'SECOND_QUALITY'
          ? 'SECOND_QUALITY'
          : 'APPROVED';
    await this.raw.grnRoll.update({
      where: { id: rollId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { status: status as any },
    });
  }

  private get raw() {
    return this.prisma.raw;
  }

  private ctxTenant(): string {
    const tenantId = getRequestContext()?.tenantId;
    if (!tenantId) throw new BadRequestException('Inspections require a tenant context');
    return tenantId;
  }

  private get ctx() {
    return getRequestContext();
  }
}
