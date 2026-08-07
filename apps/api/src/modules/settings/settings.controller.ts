import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/setting.dto';

@ApiTags('configuration')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Permissions('setting:read')
  get() {
    return this.settings.getGrouped();
  }

  @Put()
  @Permissions('setting:update')
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.updateValues(dto.values);
  }
}
