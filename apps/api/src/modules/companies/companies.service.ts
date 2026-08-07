import { Injectable } from '@nestjs/common';
import { CrudService } from '../../common/crud.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';

@Injectable()
export class CompaniesService extends CrudService {
  protected readonly model = 'Company';

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
      factories: { where: { isDeleted: false } },
    });
  }

  create(dto: CreateCompanyDto) {
    return super.create({ ...dto });
  }

  update(id: string, dto: UpdateCompanyDto) {
    return super.update(id, { ...dto });
  }
}
