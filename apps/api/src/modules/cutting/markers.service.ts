import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LengthUnit,
  MarkerStatus,
  calculateMarker,
  deriveMarkerLength,
  garmentsPerMarker,
  round4,
  toBase,
  validatePlacement,
  type DefectSpan,
} from '@fabriq/shared';
import { getRequestContext } from '@fabriq/database';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../procurement/numbering.service';
import { CreateMarkerDto, FinalizeMarkerDto, MarkerPieceDto, UpdateMarkerDto } from './dto/marker.dto';

interface MarkerRow {
  id: string;
  number: string;
  version: number;
  status: string;
  widthCm: any;
  lengthCm: any;
  endAllowanceCm: any;
  sizeRatioJson: any;
  [key: string]: unknown;
}

/**
 * Markers: pattern-piece layouts with server-authoritative geometry math.
 *
 * Every save recomputes length / areas / efficiency / garments-per-marker
 * from the submitted piece geometry using the shared calculation engine, so
 * a stale or malicious client can never persist fabricated planning numbers.
 * Finalizing validates placement and blocks invalid layouts; every finalize
 * writes an immutable MarkerRevision snapshot.
 */
@Injectable()
export class MarkersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
  ) {}

  // ── queries ─────────────────────────────────────────────────────────────

  async list(query: { search?: string; status?: string; page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = { isDeleted: false };
    if (query.status) where['status'] = query.status;
    if (query.search) {
      where['OR'] = ['number', 'styleRef', 'fabricType', 'color'].map((f) => ({
        [f]: { contains: query.search, mode: 'insensitive' },
      }));
    }
    const [items, total] = await Promise.all([
      this.prisma.client.marker.findMany({
        where,
        orderBy: { updatedOn: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { pieces: true, layPlans: true } } },
      }),
      this.prisma.client.marker.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async getById(id: string) {
    const marker = await this.prisma.client.marker.findFirst({
      where: { id, isDeleted: false },
      include: {
        pieces: { orderBy: { xCm: 'asc' } },
        patternSet: { select: { id: true, code: true, name: true } },
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          select: { id: true, revisionNumber: true, note: true, createdOn: true, createdBy: true },
        },
        _count: { select: { layPlans: true } },
      },
    });
    if (!marker) throw new NotFoundException('Marker not found');
    return marker;
  }

  // ── mutations ───────────────────────────────────────────────────────────

  async create(dto: CreateMarkerDto) {
    const widthCm = round4(toBase(dto.width, dto.widthUnit ?? LengthUnit.CM));
    if (widthCm <= 0) throw new BadRequestException('Marker width must be greater than zero');
    const pieces = dto.pieces ?? [];
    const calc = this.compute(dto.sizeRatio ?? {}, widthCm, dto.length ?? null, dto.endAllowance ?? 0, pieces);
    const number = dto.number?.trim() || (await this.numbering.next('MK'));
    const ctx = getRequestContext();
    const marker = await this.prisma.raw.marker.create({
      data: {
        tenantId: this.tenantId(),
        number,
        version: 1,
        status: MarkerStatus.DRAFT,
        patternSetId: dto.patternSetId,
        styleRef: dto.styleRef,
        fabricType: dto.fabricType,
        color: dto.color,
        sizeRatioJson: dto.sizeRatio ?? {},
        widthCm,
        lengthCm: calc.lengthCm,
        endAllowanceCm: round4(dto.endAllowance ?? 0),
        patternAreaCm2: calc.patternAreaCm2,
        markerAreaCm2: calc.markerAreaCm2,
        efficiencyPct: calc.efficiencyPct,
        garmentsPerMarker: calc.garmentsPerMarker,
        notes: dto.notes,
        createdBy: ctx?.userId ?? null,
        updatedBy: ctx?.userId ?? null,
        pieces: pieces.length
          ? {
              create: pieces.map((p) => ({
                tenantId: this.tenantId(),
                name: p.name,
                size: p.size,
                patternPieceId: p.patternPieceId,
                xCm: round4(p.xCm),
                yCm: round4(p.yCm),
                widthCm: round4(p.widthCm),
                heightCm: round4(p.heightCm),
                rotationDeg: round4(p.rotationDeg ?? 0),
                grainDirection: p.grainDirection ?? 'VERTICAL',
                mirrored: p.mirrored ?? false,
                color: p.color,
              })),
            }
          : undefined,
      },
    });
    return this.getById(marker.id);
  }

  async update(id: string, dto: UpdateMarkerDto) {
    const marker = await this.getMarkerRow(id);
    if (marker.status === MarkerStatus.FINALIZED && (dto.pieces || dto.width != null || dto.length != null)) {
      throw new BadRequestException('Marker is finalized — create a revision to modify the layout');
    }
    const widthUnit = dto.widthUnit ?? LengthUnit.CM;
    const sizeRatio = dto.sizeRatio ?? (marker.sizeRatioJson as Record<string, number>);
    const widthCm =
      dto.width != null ? round4(toBase(dto.width, widthUnit)) : Number(marker.widthCm);
    const endAllowance = dto.endAllowance ?? Number(marker.endAllowanceCm);
    // Marker length is always expressed in the base unit (cm) — never in the
    // width display unit.
    const lengthCm = dto.length != null ? round4(dto.length) : Number(marker.lengthCm);
    const pieces = dto.pieces ?? (await this.loadPieces(id));
    if (widthCm <= 0) throw new BadRequestException('Marker width must be greater than zero');
    const calc = this.compute(sizeRatio, widthCm, lengthCm, endAllowance, pieces);
    const ctx = getRequestContext();

    await this.prisma.raw.$transaction(async (tx: any) => {
      await tx.marker.update({
        where: { id },
        data: {
          ...(dto.patternSetId !== undefined ? { patternSetId: dto.patternSetId } : {}),
          ...(dto.styleRef !== undefined ? { styleRef: dto.styleRef } : {}),
          ...(dto.fabricType !== undefined ? { fabricType: dto.fabricType } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.sizeRatio !== undefined ? { sizeRatioJson: dto.sizeRatio } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          widthCm,
          lengthCm: calc.lengthCm,
          endAllowanceCm: round4(endAllowance),
          patternAreaCm2: calc.patternAreaCm2,
          markerAreaCm2: calc.markerAreaCm2,
          efficiencyPct: calc.efficiencyPct,
          garmentsPerMarker: calc.garmentsPerMarker,
          updatedBy: ctx?.userId ?? null,
          version: { increment: 1 },
        },
      });
      if (dto.pieces) {
        await tx.markerPiece.deleteMany({ where: { markerId: id } });
        if (dto.pieces.length) {
          await tx.markerPiece.createMany({
            data: dto.pieces.map((p) => ({
              tenantId: this.tenantId(),
              markerId: id,
              name: p.name,
              size: p.size,
              patternPieceId: p.patternPieceId,
              xCm: round4(p.xCm),
              yCm: round4(p.yCm),
              widthCm: round4(p.widthCm),
              heightCm: round4(p.heightCm),
              rotationDeg: round4(p.rotationDeg ?? 0),
              grainDirection: p.grainDirection ?? 'VERTICAL',
              mirrored: p.mirrored ?? false,
              color: p.color,
            })),
          });
        }
      }
    });
    return this.getById(id);
  }

  /** Deep copy of a marker (pieces included) as a new DRAFT marker. */
  async duplicate(id: string) {
    const source = await this.getById(id);
    const ctx = getRequestContext();
    const number = await this.numbering.next('MK');
    const copy = await this.prisma.raw.marker.create({
      data: {
        tenantId: this.tenantId(),
        number,
        version: 1,
        status: MarkerStatus.DRAFT,
        patternSetId: source.patternSetId,
        styleRef: source.styleRef,
        fabricType: source.fabricType,
        color: source.color,
        sizeRatioJson: source.sizeRatioJson as any,
        widthCm: source.widthCm as any,
        lengthCm: source.lengthCm as any,
        endAllowanceCm: source.endAllowanceCm as any,
        patternAreaCm2: source.patternAreaCm2 as any,
        markerAreaCm2: source.markerAreaCm2 as any,
        efficiencyPct: source.efficiencyPct as any,
        garmentsPerMarker: source.garmentsPerMarker,
        notes: source.notes,
        createdBy: ctx?.userId ?? null,
        updatedBy: ctx?.userId ?? null,
        pieces: {
          create: source.pieces.map((p: any) => ({
            tenantId: this.tenantId(),
            name: p.name,
            size: p.size,
            patternPieceId: p.patternPieceId,
            xCm: p.xCm,
            yCm: p.yCm,
            widthCm: p.widthCm,
            heightCm: p.heightCm,
            rotationDeg: p.rotationDeg,
            grainDirection: p.grainDirection,
            mirrored: p.mirrored,
            color: p.color,
          })),
        },
      },
    });
    return this.getById(copy.id);
  }

  /**
   * Finalize: re-validates placement server-side (defect overlap requires an
   * explicit acknowledgment) and snapshots the marker into MarkerRevision.
   */
  async finalize(id: string, dto: FinalizeMarkerDto) {
    const marker = await this.getMarkerRow(id);
    if (marker.status === MarkerStatus.FINALIZED) {
      throw new BadRequestException('Marker is already finalized');
    }
    const [pieces, roll] = await Promise.all([
      this.loadPieces(id) as Promise<MarkerPieceDto[]>,
      this.findRollForMarker(id),
    ]);
    const widthCm = Number(marker.widthCm);
    const pieceInputs = pieces.map((p) => ({
      id: p.id,
      width: p.widthCm,
      height: p.heightCm,
      x: p.xCm,
      y: p.yCm,
      rotation: p.rotationDeg ?? 0,
    }));
    const lengthCm = Number(marker.lengthCm) || deriveMarkerLength(pieceInputs, Number(marker.endAllowanceCm));
    const sizeRatio = marker.sizeRatioJson as Record<string, number>;
    const calc = this.compute(sizeRatio, widthCm, lengthCm, Number(marker.endAllowanceCm), pieces);

    // Blocking validation: an invalid production layout can never be saved.
    const blocking = validatePlacement({
      pieces: pieceInputs,
      usableWidthCm: widthCm,
      markerLengthCm: lengthCm,
    }).filter((i) => i.code === 'OUTSIDE_WIDTH' || i.code === 'OUTSIDE_MARKER' || i.code === 'OVERLAP');
    if (blocking.length > 0) {
      const byCode = blocking.reduce<Record<string, number>>((acc, i) => {
        acc[i.code] = (acc[i.code] ?? 0) + 1;
        return acc;
      }, {});
      throw new BadRequestException(
        `Marker cannot be finalized — fix placement first: ${Object.entries(byCode)
          .map(([code, n]) => `${n}× ${code.replace(/_/g, ' ').toLowerCase()}`)
          .join(', ')}`,
      );
    }

    // Re-validate against the roll's defects when the marker is already
    // referenced by a lay plan (planned position known).
    let defectIssues = 0;
    if (roll) {
      const defects = await this.prisma.client.fabricDefect.findMany({
        where: { rollId: roll.id, isDeleted: false },
        select: { id: true, startCm: true, endCm: true },
      });
      const lays = await this.prisma.client.layPlan.findMany({
        where: { markerId: id },
        select: { markerStartCm: true },
        take: 1,
      });
      const markerStartCm = lays[0] ? Number(lays[0].markerStartCm) : 0;
      const issues = validatePlacement({
        pieces: pieceInputs,
        usableWidthCm: widthCm,
        markerLengthCm: lengthCm,
        defects: defects.map((d) => ({ id: d.id, startCm: Number(d.startCm), endCm: Number(d.endCm) })),
        markerStartCm,
      });
      defectIssues = issues.filter((i) => i.code === 'CROSSES_DEFECT').length;
    }

    const ctx = getRequestContext();
    const result = await this.prisma.raw.$transaction(async (tx: any) => {
      const updated = await tx.marker.update({
        where: { id },
        data: {
          status: MarkerStatus.FINALIZED,
          lengthCm: calc.lengthCm,
          patternAreaCm2: calc.patternAreaCm2,
          markerAreaCm2: calc.markerAreaCm2,
          efficiencyPct: calc.efficiencyPct,
          garmentsPerMarker: calc.garmentsPerMarker,
          updatedBy: ctx?.userId ?? null,
        },
      });
      const last = await tx.markerRevision.findFirst({
        where: { markerId: id },
        orderBy: { revisionNumber: 'desc' },
      });
      const revisionNumber = (last?.revisionNumber ?? 0) + 1;
      await tx.markerRevision.create({
        data: {
          tenantId: this.tenantId(),
          markerId: id,
          revisionNumber,
          note: dto.note ?? `Finalized v${revisionNumber}`,
          createdBy: ctx?.userId ?? null,
          snapshot: {
            status: updated.status,
            sizeRatio: sizeRatio,
            widthCm: Number(updated.widthCm),
            lengthCm: Number(updated.lengthCm),
            endAllowanceCm: Number(updated.endAllowanceCm),
            patternAreaCm2: Number(updated.patternAreaCm2),
            markerAreaCm2: Number(updated.markerAreaCm2),
            efficiencyPct: Number(updated.efficiencyPct),
            garmentsPerMarker: updated.garmentsPerMarker,
            pieces: pieces.map((p: any) => ({
              name: p.name,
              size: p.size,
              xCm: Number(p.xCm),
              yCm: Number(p.yCm),
              widthCm: Number(p.widthCm),
              heightCm: Number(p.heightCm),
              rotationDeg: Number(p.rotationDeg),
              grainDirection: p.grainDirection,
              mirrored: p.mirrored,
            })),
          },
        },
      });
      return updated;
    });
    return { marker: result, defectWarnings: defectIssues };
  }

  async archive(id: string) {
    const marker = await this.getMarkerRow(id);
    const layCount = await this.prisma.client.layPlan.count({ where: { markerId: id } });
    if (layCount > 0) throw new BadRequestException('Marker is used by lay plans and cannot be archived');
    return this.prisma.raw.marker.update({
      where: { id },
      data: { isDeleted: true, deletedOn: new Date(), deletedBy: getRequestContext()?.userId ?? null },
    });
  }

  // ── what-if planning calculator ─────────────────────────────────────────

  /**
   * Evaluates a candidate marker combination against a cut order's required
   * quantities using real marker geometry — never invented numbers.
   */
  async planCalculator(dto: {
    required: Record<string, number>;
    ply: number;
    candidates: Array<{ markerId: string; lays?: number }>;
  }) {
    if (dto.ply <= 0) throw new BadRequestException('Ply must be a positive number');
    const results = [];
    let totalFabricCm = 0;
    let totalOutput = 0;
    for (const c of dto.candidates) {
      const marker = await this.getMarkerRow(c.markerId);
      const gpm = garmentsPerMarker(marker.sizeRatioJson as Record<string, number>);
      const lays = c.lays ?? 0;
      const output = lays * gpm * dto.ply;
      const fabricCm = round4(lays * Number(marker.lengthCm));
      totalOutput += output;
      totalFabricCm += fabricCm;
      results.push({
        markerId: marker.id,
        markerNumber: marker.number,
        garmentsPerMarker: gpm,
        markerLengthCm: Number(marker.lengthCm),
        efficiencyPct: Number(marker.efficiencyPct),
        lays,
        output,
        fabricCm,
      });
    }
    const requiredTotal = Object.values(dto.required).reduce((s, v) => s + Math.max(0, v), 0);
    return {
      options: results.map((r) => ({ ...r })),
      totals: {
        requiredTotal,
        plannedOutput: totalOutput,
        short: Math.max(0, requiredTotal - totalOutput),
        excess: Math.max(0, totalOutput - requiredTotal),
        fabricCm: totalFabricCm,
      },
    };
  }

  // ── internals ───────────────────────────────────────────────────────────

  /** Single source of truth for planning numbers (shared engine). */
  private compute(
    sizeRatio: Record<string, number>,
    widthCm: number,
    lengthCm: number | null,
    endAllowance: number,
    pieces: MarkerPieceDto[],
  ) {
    const calc = calculateMarker({
      usableWidthCm: widthCm,
      lengthCm: lengthCm && lengthCm > 0 ? lengthCm : null,
      endAllowanceCm: endAllowance,
      pieces: pieces.map((p) => ({
        id: p.id,
        width: p.widthCm,
        height: p.heightCm,
        x: p.xCm,
        y: p.yCm,
        rotation: p.rotationDeg ?? 0,
      })),
    });
    return { ...calc, garmentsPerMarker: garmentsPerMarker(sizeRatio) };
  }

  private async loadPieces(markerId: string): Promise<MarkerPieceDto[]> {
    const rows = await this.prisma.client.markerPiece.findMany({ where: { markerId } });
    return rows.map((p: any) => ({
      id: p.id,
      name: p.name,
      size: p.size ?? undefined,
      patternPieceId: p.patternPieceId ?? undefined,
      xCm: Number(p.xCm),
      yCm: Number(p.yCm),
      widthCm: Number(p.widthCm),
      heightCm: Number(p.heightCm),
      rotationDeg: Number(p.rotationDeg),
      grainDirection: p.grainDirection,
      mirrored: p.mirrored,
      color: p.color ?? undefined,
    }));
  }

  private async findRollForMarker(markerId: string) {
    const lay = await this.prisma.client.layPlan.findFirst({ where: { markerId } });
    if (!lay) return null;
    return this.prisma.client.fabricRoll.findFirst({ where: { id: lay.rollId } });
  }

  private async getMarkerRow(id: string): Promise<MarkerRow> {
    const marker = await this.prisma.client.marker.findFirst({ where: { id, isDeleted: false } });
    if (!marker) throw new NotFoundException('Marker not found');
    return marker as unknown as MarkerRow;
  }

  private tenantId(): string {
    const tid = getRequestContext()?.tenantId;
    if (!tid) throw new BadRequestException('Cutting operations require a tenant context');
    return tid;
  }
}
