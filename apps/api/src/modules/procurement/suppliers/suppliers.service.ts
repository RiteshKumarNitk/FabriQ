import { Injectable } from '@nestjs/common';
import { CrudService } from '../../../common/crud.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

@Injectable()
export class SuppliersService extends CrudService {
  protected readonly model = 'Supplier';

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override list(dto: any) {
    return super.list(dto, {
      searchFields: ['code', 'name', 'gstin', 'city', 'email', 'contactPerson'],
      defaultSortBy: 'createdOn',
    });
  }

  override getById(id: string) {
    return super.getById(id, {
      _count: { select: { purchaseOrders: true } },
    });
  }

  create(dto: CreateSupplierDto) {
    return super.create({ ...dto });
  }

  update(id: string, dto: UpdateSupplierDto) {
    return super.update(id, { ...dto });
  }
}
