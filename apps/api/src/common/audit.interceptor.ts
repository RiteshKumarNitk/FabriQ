import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditAction } from '@fabriq/shared';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_KEYS = new Set(['password', 'passwordHash', 'currentPassword', 'newPassword', 'accessToken', 'refreshToken', 'token']);
const SKIP_PREFIXES = ['/api/v1/auth', '/api/v1/audit', '/api/v1/health', '/api/v1/documents/download'];

/**
 * Audit interceptor — records every mutating request as an immutable
 * AuditLog row (create/update/archive), including a sanitized request body,
 * actor and tenant context. Powers both compliance auditing and the UI
 * activity timeline.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method = req.method as string;

    if (method === 'GET' || SKIP_PREFIXES.some((p) => req.path.startsWith(p))) {
      return next.handle();
    }

    const action = this.actionFor(method);
    return next.handle().pipe(
      tap({
        next: (payload) => {
          void this.record(req, action, payload);
        },
        error: () => {
          /* only successful mutations are audited in Phase 1 */
        },
      }),
    );
  }

  private actionFor(method: string): AuditAction {
    switch (method) {
      case 'POST':
        return AuditAction.CREATE;
      case 'PATCH':
      case 'PUT':
        return AuditAction.UPDATE;
      case 'DELETE':
        return AuditAction.ARCHIVE;
      default:
        return AuditAction.UPDATE;
    }
  }

  private async record(req: any, action: AuditAction, payload: unknown): Promise<void> {
    try {
      const ctx = req.ctx as { userId?: string; tenantId?: string | null; companyId?: string | null; factoryId?: string | null } | undefined;
      const entityId = (req.params.id as string | undefined) ?? this.extractId(payload);
      const segments = (req.path as string).split('/').filter(Boolean);
      const entityType = segments[2] ?? 'unknown'; // /api/v1/<module>/...
      const module = segments[2] ?? 'unknown';

      await this.prisma.raw.auditLog.create({
        data: {
          tenantId: ctx?.tenantId ?? null,
          companyId: ctx?.companyId ?? null,
          factoryId: ctx?.factoryId ?? null,
          userId: ctx?.userId ?? null,
          action,
          module,
          entityType,
          entityId: entityId ?? null,
          method: req.method,
          path: req.path,
          requestBody: this.sanitize(req.body) as any,
          statusCode: payload && typeof payload === 'object' && 'statusCode' in (payload as any) ? (payload as any).statusCode : 200,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });
    } catch (e) {
      // Audit must never break the request.
      console.error('Audit write failed', e);
    }
  }

  private extractId(payload: unknown): string | null {
    if (payload && typeof payload === 'object') {
      const p = payload as Record<string, unknown>;
      if (typeof p.id === 'string') return p.id;
      if (p.data && typeof p.data === 'object' && typeof (p.data as any).id === 'string') {
        return (p.data as any).id as string;
      }
    }
    return null;
  }

  private sanitize(body: unknown): unknown {
    if (body === null || body === undefined) return undefined;
    if (typeof body !== 'object') return body;
    if (Array.isArray(body)) return body.map((v) => this.sanitize(v));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (SENSITIVE_KEYS.has(k)) continue;
      out[k] = this.sanitize(v);
    }
    return out;
  }
}
