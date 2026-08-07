import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators';

@ApiTags('system')
@Controller('health')
export class AppController {
  @Public()
  @Get()
  health() {
    return {
      status: 'ok',
      service: 'fabriq-api',
      time: new Date().toISOString(),
    };
  }
}
