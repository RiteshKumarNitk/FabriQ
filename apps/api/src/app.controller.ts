import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators';

// The root path (/) is served by an express-level route in main.ts — a branded
// landing page — so it is intentionally not declared as a controller route here.

@ApiTags('system')
@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'fabriq-api',
      time: new Date().toISOString(),
    };
  }
}

