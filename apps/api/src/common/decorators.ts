import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { RequestContext } from '@fabriq/shared';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as accessible without authentication. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
/** Requires all listed permission codes; enforced by RbacGuard. */
export const Permissions = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);

/**
 * Injects the authenticated request context (user, tenant, permissions).
 * Typed via the generic — default to RequestContext.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext => {
    const req = context.switchToHttp().getRequest();
    if (!req.ctx) {
      throw new Error('No request context — route is not authenticated');
    }
    return req.ctx as RequestContext;
  },
);

/** Injects an optional entity id path parameter. */
export const EntityId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    return context.switchToHttp().getRequest().params.id as string;
  },
);
