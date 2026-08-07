import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { ApiResponse, PaginatedResult } from '@fabriq/shared';

/**
 * Wraps every successful response in the standard envelope:
 *   { success: true, data, meta? }
 * Paginated results are unwrapped into data + meta.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, any> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((payload): ApiResponse<unknown> => {
        if (payload && typeof payload === 'object' && 'items' in payload && 'meta' in payload) {
          const p = payload as PaginatedResult<unknown>;
          return { success: true, data: p.items, meta: p.meta };
        }
        return { success: true, data: payload as T };
      }),
    );
  }
}
