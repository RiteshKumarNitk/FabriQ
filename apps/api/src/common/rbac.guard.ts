import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './decorators';
import type { RequestContext } from '@fabriq/shared';

/**
 * RBAC guard. Enforces permission codes declared with @Permissions(...) on
 * controllers/handlers. Platform admins bypass permission checks.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const ctx = context.switchToHttp().getRequest().ctx as RequestContext;
    if (!ctx) throw new ForbiddenException('Not authenticated');

    if (ctx.isPlatformAdmin) return true;

    const missing = required.filter((code) => !ctx.permissions.includes(code));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permission(s): ${missing.join(', ')}`);
    }
    // Platform-scope permissions are a platform-admin capability — a role must
    // never grant them to a tenant user, even if a role was assigned the code
    // before this guard existed.
    if (required.some((code) => code.startsWith('platform:')) && !ctx.isPlatformAdmin) {
      throw new ForbiddenException('Platform-level access requires platform admin');
    }
    return true;
  }
}
