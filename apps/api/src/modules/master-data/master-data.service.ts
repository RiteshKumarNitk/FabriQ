import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CrudService } from '../../common/crud.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ListQueryDto } from '../../common/pagination.dto';
import { buildListArgs, buildPaginationMeta } from '../../common/list-args';
import type { CreateItemWithCategoryDto, CreateMasterDataItemDto } from './dto/master-data.dto';

@Injectable()
export class MasterDataService extends CrudService {
  protected readonly model = 'MasterDataCategory';

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  // ── categories ──────────────────────────────────────────────────────────

  listCategories(dto: ListQueryDto) {
    return super.list(dto, {
      searchFields: ['code', 'name'],
      model: 'MasterDataCategory',
      defaultSortBy: 'createdOn',
    });
  }

  async getCategory(id: string) {
    const category = await super.getById(id, {
      items: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
      _count: { select: { items: true } },
    });
    if (!category) throw new NotFoundException('Category not found');
    category.itemCount = category._count?.items ?? 0;
    delete category._count;
    return category;
  }

  createCategory(dto: any) {
    return super.create({ ...dto });
  }

  updateCategory(id: string, dto: any) {
    return super.update(id, { ...dto });
  }

  archiveCategory(id: string) {
    return super.archive(id);
  }

  // ── items ───────────────────────────────────────────────────────────────

  /** Flat, cross-category item list used by the admin UI: GET /master-data/items */
  async listAllItems(dto: ListQueryDto) {
    const args = buildListArgs(dto, {
      searchFields: ['code', 'name'],
      model: 'MasterDataItem',
      where: { isDeleted: false },
      defaultSortBy: 'sortOrder',
      defaultSortOrder: 'asc',
    });
    const [items, total] = await Promise.all([
      this.prisma.client.masterDataItem.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.masterDataItem.count({ where: args.where }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }

  /** Item detail used by the admin UI: GET /master-data/items/:id */
  async getItem(id: string) {
    const item = await this.prisma.client.masterDataItem.findFirst({
      where: { id, isDeleted: false },
    });
    if (!item) throw new NotFoundException('Master data item not found');
    return item;
  }

  /** Create with the category in the body (admin UI convention): POST /master-data/items */
  async createItemWithCategory(dto: CreateItemWithCategoryDto) {
    const { categoryId, ...rest } = dto;
    if (!categoryId) throw new BadRequestException('categoryId is required');
    const cat = await super.getById(categoryId);
    if (!cat) throw new NotFoundException('Category not found');
    // tenantId is stamped by the tenant-scoped client extension (cast matches
    // the sibling createItem / CrudService data convention).
    return this.prisma.client.masterDataItem.create({
      data: { ...rest, categoryId, createdBy: this.ctx?.userId ?? null, updatedBy: this.ctx?.userId ?? null } as any,
    });
  }

  async listItems(categoryId: string, dto: ListQueryDto) {
    const cat = await super.getById(categoryId);
    if (!cat) throw new NotFoundException('Category not found');
    const args = buildListArgs(dto, {
      searchFields: ['code', 'name'],
      model: 'MasterDataItem',
      where: { isDeleted: false, categoryId },
      defaultSortBy: 'sortOrder',
      defaultSortOrder: 'asc',
    });
    const [items, total] = await Promise.all([
      this.prisma.client.masterDataItem.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.masterDataItem.count({ where: args.where }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }

  async createItem(categoryId: string, dto: any) {
    const cat = await super.getById(categoryId);
    if (!cat) throw new NotFoundException('Category not found');
    return this.prisma.client.masterDataItem.create({
      data: { ...dto, categoryId, createdBy: this.ctx?.userId ?? null, updatedBy: this.ctx?.userId ?? null },
    });
  }

  updateItem(id: string, dto: any) {
    return this.prisma.client.masterDataItem.update({
      where: { id, isDeleted: false },
      data: { ...dto, updatedBy: this.ctx?.userId ?? null, version: { increment: 1 } },
    });
  }

  archiveItem(id: string) {
    return this.prisma.client.masterDataItem.update({
      where: { id, isDeleted: false },
      data: { isDeleted: true, deletedBy: this.ctx?.userId ?? null, deletedOn: new Date() },
    });
  }

  /** Lightweight options for dropdowns: GET /master-data/options?category=FABRIC_TYPE */
  async options(categoryCode: string) {
    const tenantId = this.ctx?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Options require a tenant context');
    }
    if (!categoryCode) {
      throw new BadRequestException('Query parameter "category" is required');
    }
    const category = await this.prisma.client.masterDataCategory.findUnique({
      where: { tenantId_code: { tenantId, code: categoryCode } },
    });
    if (!category) {
      throw new BadRequestException(`Master data category '${categoryCode}' not found`);
    }
    const items = await this.prisma.client.masterDataItem.findMany({
      where: { categoryId: category.id, isDeleted: false, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true },
    });
    return items;
  }
}
