import { BadRequestException, Injectable } from '@nestjs/common';
import { CrudService } from '../../common/crud.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrgUnitsService extends CrudService {
  protected readonly model = 'Department';

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  // ── Departments ─────────────────────────────────────────────────────────

  listDepartments(dto: any) {
    return super.list(dto, {
      searchFields: ['code', 'name'],
      defaultSortBy: 'createdOn',
    });
  }

  getDepartment(id: string) {
    return super.getById(id, {
      factory: true,
      sections: { where: { isDeleted: false } },
    });
  }

  async createDepartment(dto: any) {
    await this.assertScoped('Factory', dto.factoryId);
    return super.create({ ...dto });
  }

  async updateDepartment(id: string, dto: any) {
    if (dto.factoryId) await this.assertScoped('Factory', dto.factoryId);
    return super.update(id, { ...dto });
  }

  archiveDepartment(id: string) {
    return super.archive(id);
  }

  // ── Sections ────────────────────────────────────────────────────────────

  listSections(dto: any, departmentId?: string) {
    return super.list(dto, {
      searchFields: ['code', 'name'],
      defaultSortBy: 'createdOn',
      where: { isDeleted: false, ...(departmentId ? { departmentId } : {}) },
    });
  }

  getSection(id: string) {
    return super.getById(id, { department: { include: { factory: true } } });
  }

  async createSection(dto: any) {
    await this.assertScoped('Department', dto.departmentId);
    return this.prisma.client.section.create({
      data: { ...dto, createdBy: this.ctx?.userId ?? null, updatedBy: this.ctx?.userId ?? null },
    });
  }

  async updateSection(id: string, dto: any) {
    if (dto.departmentId) await this.assertScoped('Department', dto.departmentId);
    return this.prisma.client.section.update({
      where: { id, isDeleted: false },
      data: { ...dto, updatedBy: this.ctx?.userId ?? null, version: { increment: 1 } },
    });
  }

  async archiveSection(id: string) {
    return this.prisma.client.section.update({
      where: { id, isDeleted: false },
      data: { isDeleted: true, deletedBy: this.ctx?.userId ?? null, deletedOn: new Date() },
    });
  }

  // ── Production lines ────────────────────────────────────────────────────

  listLines(dto: any, factoryId?: string) {
    return super.list(dto, {
      searchFields: ['code', 'name'],
      defaultSortBy: 'createdOn',
      where: { isDeleted: false, ...(factoryId ? { factoryId } : {}) },
    });
  }

  getLine(id: string) {
    return super.getById(id, { factory: true, department: true });
  }

  async createLine(dto: any) {
    await this.assertScoped('Factory', dto.factoryId);
    if (dto.departmentId) await this.assertScoped('Department', dto.departmentId);
    return this.prisma.client.productionLine.create({
      data: { ...dto, createdBy: this.ctx?.userId ?? null, updatedBy: this.ctx?.userId ?? null },
    });
  }

  async updateLine(id: string, dto: any) {
    if (dto.factoryId) await this.assertScoped('Factory', dto.factoryId);
    if (dto.departmentId) await this.assertScoped('Department', dto.departmentId);
    return this.prisma.client.productionLine.update({
      where: { id, isDeleted: false },
      data: { ...dto, updatedBy: this.ctx?.userId ?? null, version: { increment: 1 } },
    });
  }

  async archiveLine(id: string) {
    return this.prisma.client.productionLine.update({
      where: { id, isDeleted: false },
      data: { isDeleted: true, deletedBy: this.ctx?.userId ?? null, deletedOn: new Date() },
    });
  }

  // ── Tree ────────────────────────────────────────────────────────────────

  async getTree(factoryId?: string) {
    const where = factoryId ? { id: factoryId } : {};
    const factories = await this.prisma.client.factory.findMany({
      where: { ...where, isDeleted: false },
      include: {
        departments: {
          where: { isDeleted: false },
          include: {
            sections: { where: { isDeleted: false }, orderBy: { code: 'asc' } },
            productionLines: { where: { isDeleted: false }, orderBy: { code: 'asc' } },
          },
          orderBy: { code: 'asc' },
        },
      },
      orderBy: { code: 'asc' },
    });
    return factories;
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async assertScoped(model: string, id: string): Promise<void> {
    const found = await (this.prisma.client as any)[model].findUnique({ where: { id } });
    if (!found || found.isDeleted) {
      throw new BadRequestException(`${model} does not exist in this tenant`);
    }
  }
}
