import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/pagination.dto';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
@Permissions('platform:manage')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.tenants.list(query, { searchFields: ['code', 'name'] });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tenants.getById(id);
  }

  @Get(':id/stats')
  stats(@Param('id') id: string) {
    return this.tenants.getStats(id);
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.update(id, dto);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.tenants.archive(id);
  }
}
