import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { AuditAction, UserStatus } from '@fabriq/shared';
import { getRequestContext } from '@fabriq/database';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RefreshTokenDto } from './dto/auth.dto';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto, meta: RequestMeta = {}) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.raw.user.findUnique({
      where: { email },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });

    if (!user || user.isDeleted) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== UserStatus.ACTIVE && user.status !== UserStatus.PENDING) {
      throw new ForbiddenException('This account is not active');
    }

    const roles = user.roles.map((r) => r.role.code);
    const permissions = Array.from(
      new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code))),
    );

    const tokens = await this.issueTokens(user.id, user.email, user.tenantId, user.companyId, user.factoryId, user.isPlatformAdmin, roles, permissions, meta);

    await this.prisma.raw.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.prisma.raw.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: AuditAction.LOGIN,
        module: 'auth',
        entityType: 'user',
        entityId: user.id,
        method: 'POST',
        path: '/api/v1/auth/login',
        statusCode: 200,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return { ...tokens, user: this.publicUser(user, roles, permissions) };
  }

  async refresh(dto: RefreshTokenDto, meta: RequestMeta = {}) {
    const hash = this.hash(dto.refreshToken);
    const existing = await this.prisma.raw.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: {
        user: { include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } },
      },
    });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const user = existing.user;
    if (user.isDeleted || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    const roles = user.roles.map((r) => r.role.code);
    const permissions = Array.from(
      new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code))),
    );

    const tokens = await this.issueTokens(user.id, user.email, user.tenantId, user.companyId, user.factoryId, user.isPlatformAdmin, roles, permissions, meta, existing.id);

    return { ...tokens, user: this.publicUser(user, roles, permissions) };
  }

  async logout(dto: RefreshTokenDto): Promise<{ success: boolean }> {
    const hash = this.hash(dto.refreshToken);
    const token = await this.prisma.raw.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (token && !token.revokedAt) {
      await this.prisma.raw.refreshToken.update({
        where: { id: token.id },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  }

  async me() {
    const ctx = getRequestContext();
    if (!ctx) throw new UnauthorizedException();
    const user = await this.prisma.raw.user.findUnique({
      where: { id: ctx.userId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
    if (!user || user.isDeleted) throw new UnauthorizedException();
    const roles = user.roles.map((r) => r.role.code);
    const permissions = Array.from(
      new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code))),
    );
    return this.publicUser(user, roles, permissions);
  }

  // ── internal ────────────────────────────────────────────────────────────

  private async issueTokens(
    userId: string,
    email: string,
    tenantId: string | null,
    companyId: string | null,
    factoryId: string | null,
    isPlatformAdmin: boolean,
    roles: string[],
    permissions: string[],
    meta: RequestMeta,
    replacedTokenId?: string,
  ) {
    const accessPayload = {
      sub: userId,
      email,
      tenantId,
      companyId,
      factoryId,
      roles,
      permissions,
      isPlatformAdmin,
    };
    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, type: 'refresh' },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
      },
    );

    const tokenId = randomUUID();
    const ttlMs = parseDuration(this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d');
    await this.prisma.raw.refreshToken.create({
      data: {
        id: tokenId,
        userId,
        tenantId,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + ttlMs),
        replacedByTokenId: undefined,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    if (replacedTokenId) {
      await this.prisma.raw.refreshToken.update({
        where: { id: replacedTokenId },
        data: { revokedAt: new Date(), replacedByTokenId: tokenId },
      });
    }

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private publicUser(user: any, roles: string[], permissions: string[]) {
    const { passwordHash, ...rest } = user;
    void passwordHash;
    return {
      ...rest,
      roles,
      permissions,
    };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

/** "7d", "12h", "30m" → milliseconds. Defaults to 7 days. */
function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return n * ms;
}
