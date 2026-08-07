import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/pagination.dto';
import { OrgUnitsService } from './org-units.service';
import {
  CreateDepartmentDto,
  CreateLineDto,
  CreateSectionDto,
  UpdateDepartmentDto,
  UpdateLineDto,
  UpdateSectionDto,
} from './dto/org-unit.dto';

@ApiTags('organization')
@ApiBearerAuth()
@Controller('org-units')
export class OrgUnitsController {
  constructor(private readonly orgUnits: OrgUnitsService) {}

  // tree
  @Get('tree')
  @Permissions('orgunit:read')
  tree(@Query('factoryId') factoryId?: string) {
    return this.orgUnits.getTree(factoryId);
  }

  // departments
  @Get('departments')
  @Permissions('orgunit:read')
  listDepartments(@Query() query: ListQueryDto) {
    return this.orgUnits.listDepartments(query);
  }

  @Get('departments/:id')
  @Permissions('orgunit:read')
  getDepartment(@Param('id') id: string) {
    return this.orgUnits.getDepartment(id);
  }

  @Post('departments')
  @Permissions('orgunit:create')
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.orgUnits.createDepartment(dto);
  }

  @Patch('departments/:id')
  @Permissions('orgunit:update')
  updateDepartment(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.orgUnits.updateDepartment(id, dto);
  }

  @Post('departments/:id/archive')
  @Permissions('orgunit:delete')
  archiveDepartment(@Param('id') id: string) {
    return this.orgUnits.archiveDepartment(id);
  }

  // sections
  @Get('sections')
  @Permissions('orgunit:read')
  listSections(@Query() query: ListQueryDto, @Query('departmentId') departmentId?: string) {
    return this.orgUnits.listSections(query, departmentId);
  }

  @Get('sections/:id')
  @Permissions('orgunit:read')
  getSection(@Param('id') id: string) {
    return this.orgUnits.getSection(id);
  }

  @Post('sections')
  @Permissions('orgunit:create')
  createSection(@Body() dto: CreateSectionDto) {
    return this.orgUnits.createSection(dto);
  }

  @Patch('sections/:id')
  @Permissions('orgunit:update')
  updateSection(@Param('id') id: string, @Body() dto: UpdateSectionDto) {
    return this.orgUnits.updateSection(id, dto);
  }

  @Post('sections/:id/archive')
  @Permissions('orgunit:delete')
  archiveSection(@Param('id') id: string) {
    return this.orgUnits.archiveSection(id);
  }

  // lines
  @Get('lines')
  @Permissions('orgunit:read')
  listLines(@Query() query: ListQueryDto, @Query('factoryId') factoryId?: string) {
    return this.orgUnits.listLines(query, factoryId);
  }

  @Get('lines/:id')
  @Permissions('orgunit:read')
  getLine(@Param('id') id: string) {
    return this.orgUnits.getLine(id);
  }

  @Post('lines')
  @Permissions('orgunit:create')
  createLine(@Body() dto: CreateLineDto) {
    return this.orgUnits.createLine(dto);
  }

  @Patch('lines/:id')
  @Permissions('orgunit:update')
  updateLine(@Param('id') id: string, @Body() dto: UpdateLineDto) {
    return this.orgUnits.updateLine(id, dto);
  }

  @Post('lines/:id/archive')
  @Permissions('orgunit:delete')
  archiveLine(@Param('id') id: string) {
    return this.orgUnits.archiveLine(id);
  }
}
