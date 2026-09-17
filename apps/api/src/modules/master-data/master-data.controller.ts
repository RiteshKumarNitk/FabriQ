import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/pagination.dto';
import { MasterDataService } from './master-data.service';
import {
  CreateMasterDataCategoryDto,
  CreateMasterDataItemDto,
  CreateItemWithCategoryDto,
  UpdateMasterDataCategoryDto,
  UpdateMasterDataItemDto,
} from './dto/master-data.dto';

@ApiTags('configuration')
@ApiBearerAuth()
@Controller('master-data')
export class MasterDataController {
  constructor(private readonly masterData: MasterDataService) {}

  // categories
  @Get('categories')
  @Permissions('masterdata:read')
  listCategories(@Query() query: ListQueryDto) {
    return this.masterData.listCategories(query);
  }

  @Get('categories/:id')
  @Permissions('masterdata:read')
  getCategory(@Param('id') id: string) {
    return this.masterData.getCategory(id);
  }

  @Post('categories')
  @Permissions('masterdata:create')
  createCategory(@Body() dto: CreateMasterDataCategoryDto) {
    return this.masterData.createCategory(dto);
  }

  @Patch('categories/:id')
  @Permissions('masterdata:update')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateMasterDataCategoryDto) {
    return this.masterData.updateCategory(id, dto);
  }

  @Post('categories/:id/archive')
  @Permissions('masterdata:delete')
  archiveCategory(@Param('id') id: string) {
    return this.masterData.archiveCategory(id);
  }

  // options (dropdowns)
  @Get('options')
  @Permissions('masterdata:read')
  options(@Query('category') category: string) {
    return this.masterData.options(category);
  }

  // items (flat, category chosen via body/query — used by the admin UI)
  @Get('items')
  @Permissions('masterdata:read')
  listAllItems(@Query() query: ListQueryDto) {
    return this.masterData.listAllItems(query);
  }

  @Get('items/:id')
  @Permissions('masterdata:read')
  getItem(@Param('id') id: string) {
    return this.masterData.getItem(id);
  }

  @Post('items')
  @Permissions('masterdata:create')
  createItemWithCategory(@Body() dto: CreateItemWithCategoryDto) {
    return this.masterData.createItemWithCategory(dto);
  }

  @Get('categories/:id/items')
  @Permissions('masterdata:read')
  listItems(@Param('id') id: string, @Query() query: ListQueryDto) {
    return this.masterData.listItems(id, query);
  }

  @Post('categories/:id/items')
  @Permissions('masterdata:create')
  createItem(@Param('id') id: string, @Body() dto: CreateMasterDataItemDto) {
    return this.masterData.createItem(id, dto);
  }

  @Patch('items/:id')
  @Permissions('masterdata:update')
  updateItem(@Param('id') id: string, @Body() dto: UpdateMasterDataItemDto) {
    return this.masterData.updateItem(id, dto);
  }

  @Post('items/:id/archive')
  @Permissions('masterdata:delete')
  archiveItem(@Param('id') id: string) {
    return this.masterData.archiveItem(id);
  }
}
