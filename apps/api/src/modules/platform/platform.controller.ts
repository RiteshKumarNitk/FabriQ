import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { PlatformService } from './platform.service';

@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform')
@Permissions('platform:manage')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('summary')
  summary() {
    return this.platform.summary();
  }
}
