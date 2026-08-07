import { BadRequestException, Injectable } from '@nestjs/common';
import { CrudService } from '../../common/crud.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFactoryDto, UpdateFactoryDto } from './dto/factory.dto';

@Injectable()
export class FactoriesService extends CrudService {
  protected readonly model = 'Factory';

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override list(dto: any) {
    return super.list(dto, {
      searchFields: ['code', 'name', 'city'],
      defaultSortBy: 'createdOn',
    });
  }

  override getById(id: string) {
    return super.getById(id, {
      company: true,
      warehouses: { where: { isDeleted: false } },
      productionLines: { where: { isDeleted: false } },
    });
  }

  async create(dto: CreateFactoryDto) {
    await this.assertCompanyInTenant(dto.companyId);
    return super.create({ ...dto });
  }

  async update(id: string, dto: UpdateFactoryDto) {
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
