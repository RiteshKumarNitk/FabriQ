import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/pagination.dto';
import { FabricsService } from './fabrics.service';
import { CreateFabricDto, UpdateFabricDto } from './dto/fabric.dto';

@ApiTags('cutting')
@ApiBearerAuth()
@Controller('fabrics')
export class FabricsController {
  constructor(private readonly fabrics: FabricsService) {}

  @Get()
  @Permissions('fabric:read')
  list(@Query() query: ListQueryDto) {
    return this.fabrics.list(query);
  }

  @Get(':id')
  @Permissions('fabric:read')
  get(@Param('id') id: string) {
    return this.fabrics.getById(id);
  }

  @Post()
  @Permissions('fabric:create')
  create(@Body() dto: CreateFabricDto) {
    return this.fabrics.create(dto);
  }

  @Patch(':id')
  @Permissions('fabric:update')
  update(@Param('id') id: string, @Body() dto: UpdateFabricDto) {
    return this.fabrics.update(id, dto);
  }

  @Post(':id/archive')
  @Permissions('fabric:delete')
  archive(@Param('id') id: string) {
    return this.fabrics.archive(id);
  }
}
