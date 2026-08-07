import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/pagination.dto';
import { RolesService } from './roles.service';
import { CreateRoleDto, SetRolePermissionsDto, UpdateRoleDto } from './dto/role.dto';

@ApiTags('identity')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Permissions('role:read')
  list(@Query() query: ListQueryDto) {
    return this.roles.list(query);
  }

  @Get(':id')
  @Permissions('role:read')
  get(@Param('id') id: string) {
    return this.roles.getById(id);
  }

  @Put(':id/permissions')
  @Permissions('role:update')
  setPermissions(@Param('id') id: string, @Body() dto: SetRolePermissionsDto) {
    return this.roles.setPermissions(id, dto.permissionCodes);
  }

  @Post()
  @Permissions('role:create')
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  @Permissions('role:update')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Post(':id/archive')
  @Permissions('role:delete')
  archive(@Param('id') id: string) {
    return this.roles.archive(id);
  }
}
