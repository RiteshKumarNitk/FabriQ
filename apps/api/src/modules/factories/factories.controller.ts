import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/pagination.dto';
import { FactoriesService } from './factories.service';
import { CreateFactoryDto, UpdateFactoryDto } from './dto/factory.dto';

@ApiTags('organization')
@ApiBearerAuth()
@Controller('factories')
export class FactoriesController {
  constructor(private readonly factories: FactoriesService) {}

  @Get()
  @Permissions('factory:read')
  list(@Query() query: ListQueryDto) {
    return this.factories.list(query);
  }

  @Get(':id')
  @Permissions('factory:read')
  get(@Param('id') id: string) {
    return this.factories.getById(id);
  }

  @Post()
  @Permissions('factory:create')
  create(@Body() dto: CreateFactoryDto) {
    return this.factories.create(dto);
  }

  @Patch(':id')
  @Permissions('factory:update')
  update(@Param('id') id: string, @Body() dto: UpdateFactoryDto) {
    return this.factories.update(id, dto);
  }

  @Post(':id/archive')
  @Permissions('factory:delete')
  archive(@Param('id') id: string) {
    return this.factories.archive(id);
  }
}
