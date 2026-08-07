import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/pagination.dto';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';

@ApiTags('organization')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @Permissions('company:read')
  list(@Query() query: ListQueryDto) {
    return this.companies.list(query);
  }

  @Get(':id')
  @Permissions('company:read')
  get(@Param('id') id: string) {
    return this.companies.getById(id);
  }

  @Post()
  @Permissions('company:create')
  create(@Body() dto: CreateCompanyDto) {
    return this.companies.create(dto);
  }

  @Patch(':id')
  @Permissions('company:update')
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companies.update(id, dto);
  }

  @Post(':id/archive')
  @Permissions('company:delete')
  archive(@Param('id') id: string) {
    return this.companies.archive(id);
  }
}
