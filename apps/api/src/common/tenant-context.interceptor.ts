import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { runWithRequestContext } from '@fabriq/database';
import type { RequestContext } from '@fabriq/shared';

/**
 * Binds the authenticated request context to AsyncLocalStorage for the
 * handler's execution.
 *
 * Why an interceptor and not the guard: `AsyncLocalStorage.run` only scopes
 * the callback and async work spawned *within* it, and NestJS executes the
 * handler in the router's continuation — outside whatever the guard set up.
 * An interceptor, however, subscribes to the handler inside `run(...)`, so
 * the handler and every async continuation it spawns inherit the store
 * (services read it via getRequestContext() → Prisma tenant scoping).
 *
 * Runs after JwtAuthGuard/RbacGuard, which populate `req.ctx`.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const ctx = req.ctx as RequestContext | undefined;
    if (!ctx) {
      return next.handle(); // public routes — no tenant context
    }
    return new Observable((subscriber) => {
      runWithRequestContext(ctx, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
