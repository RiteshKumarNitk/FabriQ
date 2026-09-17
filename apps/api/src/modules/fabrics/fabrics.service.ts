import { Injectable } from '@nestjs/common';
import { LengthUnit, round4, toBase } from '@fabriq/shared';
import { CrudService } from '../../common/crud.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFabricDto, UpdateFabricDto } from './dto/fabric.dto';

/**
 * Fabric master: the reusable identity behind rolls (Fabric → Fabric Roll).
 * A roll may reference a fabric via `fabricId`; the free-text identity fields
 * on the roll remain for unmanaged fabrics and GRN hand-offs.
 */
@Injectable()
export class FabricsService extends CrudService {
  protected readonly model = 'Fabric';

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override list(dto: any) {
    return super.list(dto, {
      searchFields: ['code', 'name', 'fabricType', 'composition'],
      defaultSortBy: 'createdOn',
    });
  }

  override getById(id: string) {
    return super.getById(id, {
      rolls: { where: { isDeleted: false }, select: { id: true, number: true, color: true, shadeLot: true, status: true, remainingLengthCm: true } },
    });
  }

  async create(dto: CreateFabricDto) {
    // `defaultWidth` is a DTO-only field — the row stores base-cm plus the
    // display unit; never forward the DTO field itself to Prisma.
    const { defaultWidth, defaultWidthUnit, ...rest } = dto;
    const unit = defaultWidthUnit ?? LengthUnit.INCHES;
    return super.create({
      ...rest,
      defaultWidthUnit: unit,
      defaultWidthCm: defaultWidth != null ? round4(toBase(defaultWidth, unit)) : null,
    });
  }

  async update(id: string, dto: UpdateFabricDto) {
    const { defaultWidth, defaultWidthUnit, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    if (defaultWidth != null || defaultWidthUnit != null) {
      const existing = await this.getById(id);
      const unit = defaultWidthUnit ?? (existing.defaultWidthUnit as LengthUnit) ?? LengthUnit.INCHES;
      const width = defaultWidth ?? (existing.defaultWidthCm != null ? Number(existing.defaultWidthCm) : null);
      data['defaultWidthUnit'] = unit;
      data['defaultWidthCm'] = width != null ? round4(toBase(width, unit)) : null;
    }
    return super.update(id, data);
  }
}
