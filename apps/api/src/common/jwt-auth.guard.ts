import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { RequestContext } from '@fabriq/shared';
import { IS_PUBLIC_KEY } from './decorators';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  tenantId: string | null;
  companyId: string | null;
  factoryId: string | null;
  roles: string[];
  permissions: string[];
  isPlatformAdmin: boolean;
}

/**
 * Global authentication guard. Validates the access token and attaches the
 * request context (user + tenant + permissions) to the request and to the
 * AsyncLocalStorage so the tenant-scoped Prisma client and audit layer can
 * read it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const token = this.extractBearer(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      const ctx: RequestContext = {
        userId: payload.sub,
        tenantId: payload.tenantId ?? null,
        companyId: payload.companyId ?? null,
        factoryId: payload.factoryId ?? null,
        roles: payload.roles ?? [],
        permissions: payload.permissions ?? [],
        isPlatformAdmin: payload.isPlatformAdmin ?? false,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      };
      req.ctx = ctx;
      // The ALS binding happens in TenantContextInterceptor (an interceptor
      // can scope the handler's execution; a guard cannot).
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extractBearer(header?: string): string | null {
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice(7).trim();
  }
}
