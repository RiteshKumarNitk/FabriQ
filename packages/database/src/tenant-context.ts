import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContext } from '@fabriq/shared';

/**
 * Request-scoped context (AsyncLocalStorage). Set by the auth layer on every
 * authenticated call; read by the tenant-scoped Prisma client and the audit
 * interceptor. A request without a context is treated as unauthenticated /
 * platform-level and is denied tenant data by the client extension.
 */
const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Binds the context to the current execution context and everything that
 * follows in this request's async chain (guards → interceptors → handler).
 * Used by the auth guard — unlike `run` with a callback, `enterWith` keeps
 * the store visible to the rest of the NestJS pipeline.
 */
export function enterWithRequestContext(ctx: RequestContext): void {
  storage.enterWith(ctx);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function requireRequestContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error('Request context is not available');
  }
  return ctx;
}

export type { RequestContext };
