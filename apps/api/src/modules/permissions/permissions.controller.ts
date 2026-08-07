import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSION_MODULES, PERMISSIONS } from '@fabriq/shared';
import { Permissions } from '../../common/decorators';

@ApiTags('identity')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  /** Permission catalog grouped by module — read-only, from the shared catalog. */
  @Get()
  @Permissions('permission:read')
  catalog() {
    return PERMISSION_MODULES.map((module) => ({
      module,
      permissions: PERMISSIONS.filter((p) => p.module === module),
    }));
  }
}
