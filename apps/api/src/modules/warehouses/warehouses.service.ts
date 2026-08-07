import { BadRequestException, Injectable } from '@nestjs/common';
import { CrudService } from '../../common/crud.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';

@Injectable()
export class WarehousesService extends CrudService {
  protected readonly model = 'Warehouse';

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override list(dto: any) {
    return super.list(dto, {
      searchFields: ['code', 'name'],
      defaultSortBy: 'createdOn',
    });
  }

  override getById(id: string) {
    return super.getById(id, { company: true, factory: true });
  }

  async create(dto: CreateWarehouseDto) {
    await this.assertCompanyInTenant(dto.companyId);
    return super.create({ ...dto });
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    if (dto.companyId) {
      await this.assertCompanyInTenant(dto.companyId);
    }
    return super.update(id, { ...dto });
  }

  private async assertCompanyInTenant(companyId: string): Promise<void> {
    const company = await this.prisma.client.company.findUnique({ where: { id: companyId } });
    if (!company || company.isDeleted) {
      throw new BadRequestException('Company does not exist in this tenant');
    }
  }
}
