import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { round4 } from '@fabriq/shared';
import { getRequestContext } from '@fabriq/database';
import { CrudService } from '../../common/crud.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../procurement/numbering.service';
import { ApplyToMarkerDto, CreatePatternSetDto, UpdatePatternSetDto } from './dto/pattern.dto';

/**
 * Pattern library: style-level pattern sets with versioned revisions.
 *
 * Versioning model (§6): a revision is a NEW PatternSet row that deep-copies
 * the pieces (v2 supersedes v1). Production data is never rewritten — a
 * marker referencing pattern v2 keeps pointing at the v2 row forever, so
 * creating v3 cannot alter any historical marker. (Markers additionally
 * snapshot pieces into MarkerRevision rows at finalize time.)
 */
@Injectable()
export class PatternsService extends CrudService {
  protected readonly model = 'PatternSet';

  constructor(
    prisma: PrismaService,
    private readonly numbering: NumberingService,
  ) {
    super(prisma);
  }

  override list(dto: any) {
    return super.list(dto, {
      searchFields: ['code', 'name', 'styleRef'],
      defaultSortBy: 'updatedOn',
    });
  }

  override getById(id: string) {
    return super.getById(id, {
      pieces: { orderBy: [{ name: 'asc' }, { size: 'asc' }] },
      markers: { where: { isDeleted: false }, select: { id: true, number: true, status: true, efficiencyPct: true } },
      supersedes: { select: { id: true, code: true, version: true } },
    });
  }

  async create(dto: CreatePatternSetDto) {
    const { pieces, ...header } = dto;
    // Pieces are created separately (with an explicit tenantId) because the
    // scoped client stamps only top-level data, not nested creates.
    const set = await super.create({ ...header, version: 1 });
    if (pieces?.length) {
      await this.prisma.raw.patternPiece.createMany({
        data: pieces.map((p) => ({
          tenantId: this.tenantId(),
          patternSetId: set.id,
          name: p.name,
          size: p.size,
          widthCm: round4(p.widthCm),
          heightCm: round4(p.heightCm),
          quantity: p.quantity ?? 1,
          grainDirection: p.grainDirection ?? 'VERTICAL',
          rotationAllowed: p.rotationAllowed ?? true,
          mirrored: p.mirrored ?? false,
          seamAllowanceCm: round4(p.seamAllowanceCm ?? 0),
          notes: p.notes,
        })),
      });
    }
    return this.getById(set.id);
  }

  async update(id: string, dto: UpdatePatternSetDto) {
    const existing = await this.getById(id);
    if (!existing) throw new NotFoundException('Pattern set not found');
    const { pieces, ...header } = dto;
    if (pieces) {
      // Piece edits replace the piece rows of THIS revision in place — the
      // revision is mutable until markers consume it; historical markers are
      // protected because they snapshot pieces at finalize time and pieces
      // link MarkerPiece → PatternPiece only for provenance.
      const markerUses = await this.prisma.client.marker.count({
        where: { patternSetId: id, isDeleted: false, status: 'FINALIZED' },
      });
      if (markerUses > 0 && dto.status === 'INACTIVE') {
        throw new BadRequestException('Pattern set is used by finalized markers and cannot be deactivated');
      }
      await this.prisma.raw.$transaction(async (tx: any) => {
        await tx.patternSet.update({
          where: { id },
          data: { ...header, updatedBy: this.ctx?.userId ?? null },
        });
        await tx.patternPiece.deleteMany({ where: { patternSetId: id } });
        if (pieces.length) {
          await tx.patternPiece.createMany({
            data: pieces.map((p) => ({
              tenantId: this.tenantId(),
              patternSetId: id,
              name: p.name,
              size: p.size,
              widthCm: round4(p.widthCm),
              heightCm: round4(p.heightCm),
              quantity: p.quantity ?? 1,
              grainDirection: p.grainDirection ?? 'VERTICAL',
              rotationAllowed: p.rotationAllowed ?? true,
              mirrored: p.mirrored ?? false,
              seamAllowanceCm: round4(p.seamAllowanceCm ?? 0),
              notes: p.notes,
            })),
          });
        }
      });
    } else {
      await super.update(id, header);
    }
    return this.getById(id);
  }

  /**
   * Create the next revision: a NEW PatternSet (v(n+1)) that deep-copies this
   * set's pieces. The old row stays ACTIVE untouched — existing markers keep
   * their pattern version.
   */
  async createRevision(id: string, dto: { notes?: string }) {
    const source = await this.getById(id);
    if (!source) throw new NotFoundException('Pattern set not found');
    const ctx = getRequestContext();
    const baseCode = this.baseCode(String(source.code));
    const nextVersion = Number(source.version ?? 1) + 1;
    // The revision code embeds the version so the (tenantId, code) unique
    // holds: SHIRT-001 → SHIRT-001-V2.
    const code = `${baseCode}-V${nextVersion}`;
    const created = await this.prisma.raw.patternSet.create({
      data: {
        tenantId: this.tenantId(),
        code,
        name: source.name,
        styleRef: source.styleRef,
        version: nextVersion,
        description: source.description,
        supersedesId: source.id,
        notes: dto?.notes ?? source.notes,
        createdBy: ctx?.userId ?? null,
        updatedBy: ctx?.userId ?? null,
        pieces: {
          create: (source.pieces as any[]).map((p) => ({
            tenantId: this.tenantId(),
            name: p.name,
            size: p.size,
            widthCm: p.widthCm,
            heightCm: p.heightCm,
            quantity: p.quantity,
            grainDirection: p.grainDirection,
            rotationAllowed: p.rotationAllowed,
            mirrored: p.mirrored,
            seamAllowanceCm: p.seamAllowanceCm,
            notes: p.notes,
          })),
        },
      },
    });
    return this.getById(created.id);
  }

  /** List every revision of the family a set belongs to. */
  async revisions(id: string) {
    const set = await this.getById(id);
    const baseCode = this.baseCode(String(set.code));
    const rows = await this.prisma.client.patternSet.findMany({
      where: { isDeleted: false, OR: [{ code: { startsWith: `${baseCode}-V` } }, { code: baseCode }] },
      orderBy: { version: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        version: true,
        status: true,
        supersedesId: true,
        createdOn: true,
        createdBy: true,
        _count: { select: { markers: true, pieces: true } },
      },
    });
    return rows;
  }

  /**
   * Stamp a marker's pieces from a pattern set. The set's pieces with their
   * quantity are laid out in a simple first-fit column stack — the marker
   * stays a DRAFT the planner refines on the canvas.
   */
  async applyToMarker(id: string, dto: ApplyToMarkerDto) {
    const set = await this.getById(id);
    const marker = await this.prisma.client.marker.findFirst({
      where: { id: dto.markerId, isDeleted: false },
      include: { pieces: true },
    });
    if (!marker) throw new NotFoundException('Marker not found');
    if (marker.status === 'FINALIZED') {
      throw new BadRequestException('Marker is finalized — duplicate it or create a revision first');
    }
    const pieces = set.pieces as any[];
    if (!pieces.length) throw new BadRequestException('Pattern set has no pieces to place');

    const widthCm = Number(marker.widthCm);
    const seam = dto.includeSeamAllowance === false ? 0 : 1;
    const ctx = getRequestContext();
    // First-fit placement: stack each piece (× quantity) into columns across
    // the marker width; grows the length as needed.
    let cursorX = 0;
    let cursorY = 0;
    let rowHeight = 0;
    const rows: any[] = [];
    for (const p of pieces) {
      for (let i = 0; i < Math.max(1, p.quantity ?? 1); i++) {
        const w = Number(p.widthCm) + (seam ? Number(p.seamAllowanceCm ?? 0) * 2 : 0);
        const h = Number(p.heightCm) + (seam ? Number(p.seamAllowanceCm ?? 0) * 2 : 0);
        if (w > widthCm + 1e-6) {
          throw new BadRequestException(
            `Piece "${p.name}" (${round4(w)} cm wide) does not fit the marker width (${widthCm} cm)`,
          );
        }
        if (cursorX + w > widthCm + 1e-6) {
          cursorX = 0;
          cursorY += rowHeight;
          rowHeight = 0;
        }
        rows.push({
          tenantId: this.tenantId(),
          markerId: marker.id,
          patternPieceId: p.id,
          name: p.name,
          size: p.size,
          xCm: round4(cursorX),
          yCm: round4(cursorY),
          widthCm: round4(Number(p.widthCm)),
          heightCm: round4(Number(p.heightCm)),
          rotationDeg: 0,
          grainDirection: p.grainDirection ?? 'VERTICAL',
          mirrored: false,
        });
        cursorX += w;
        rowHeight = Math.max(rowHeight, h);
      }
    }
    await this.prisma.raw.$transaction(async (tx: any) => {
      await tx.markerPiece.deleteMany({ where: { markerId: marker.id } });
      if (rows.length) await tx.markerPiece.createMany({ data: rows });
      await tx.marker.update({
        where: { id: marker.id },
        data: {
          patternSetId: id,
          lengthCm: round4(cursorY + rowHeight),
          updatedBy: ctx?.userId ?? null,
          version: { increment: 1 },
        },
      });
    });
    return this.prisma.client.marker.findFirst({
      where: { id: marker.id },
      include: { pieces: { orderBy: { yCm: 'asc' } } },
    });
  }

  /** SHIRT-001-V2 → SHIRT-001 (strip the revision suffix). */
  private baseCode(code: string): string {
    return code.replace(/-V\d+$/, '');
  }

  private tenantId(): string {
    const tid = getRequestContext()?.tenantId;
    if (!tid) throw new BadRequestException('Pattern operations require a tenant context');
    return tid;
  }
}
