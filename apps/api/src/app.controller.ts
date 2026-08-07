import { Controller, Get, Redirect } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators';

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

  @Public()
  @Get()
  @Redirect('/api/docs', 302)
  root() {
    return {
      message: 'FabriQ API is running on Vercel!',
      docs: '/api/docs',
      health: '/api/v1/health',
    };
  }
}

