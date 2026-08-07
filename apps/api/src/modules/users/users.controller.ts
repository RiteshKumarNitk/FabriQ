import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/pagination.dto';
import { UsersService } from './users.service';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';

@ApiTags('identity')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions('user:read')
  list(@Query() query: ListQueryDto) {
    return this.users.list(query);
  }

  @Get(':id')
  @Permissions('user:read')
  get(@Param('id') id: string) {
    return this.users.getById(id);
  }

  @Post()
  @Permissions('user:create')
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @Permissions('user:update')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Post(':id/reset-password')
  @Permissions('user:update')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto.newPassword);
  }

  @Post(':id/archive')
  @Permissions('user:delete')
  archive(@Param('id') id: string) {
    return this.users.archive(id);
  }
}
