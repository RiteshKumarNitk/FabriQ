import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { RemnantsService } from './remnants.service';

@ApiTags('cutting')
@ApiBearerAuth()
@Controller('remnants')
export class RemnantsController {
  constructor(private readonly remnants: RemnantsService) {}

  @Get()
  @Permissions('remnant:read')
  list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('filters') filters?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.remnants.list({
      search,
      status,
      filters,
      sortBy,
      sortOrder,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @Permissions('remnant:read')
  get(@Param('id') id: string) {
    return this.remnants.getById(id);
  }

  @Patch(':id')
  @Permissions('remnant:update')
  update(
    @Param('id') id: string,
    @Body() dto: { status?: string; location?: string; notes?: string },
  ) {
    return this.remnants.update(id, dto);
  }

  @Post(':id/archive')
  @Permissions('remnant:delete')
  archive(@Param('id') id: string) {
    return this.remnants.archive(id);
  }
}
