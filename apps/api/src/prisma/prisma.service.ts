import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  createBaseClient,
  createTenantScopedClient,
  getRequestContext,
  PrismaClient,
} from '@fabriq/database';

/**
 * PrismaService owns the base Prisma client and hands out:
 *   • `client` — a tenant-scoped client bound to the current request context
 *     (auto-injects tenantId into every query; see packages/database).
 *   • `raw`    — the unscoped base client for platform-level operations
 *     (tenants, permissions, cross-tenant provisioning, audit writes).
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly base: PrismaClient;

  constructor() {
    this.base = createBaseClient();
  }

  async onModuleInit(): Promise<void> {
    await this.base.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }

  get raw(): PrismaClient {
    return this.base;
  }

  get client(): PrismaClient {
    const ctx = getRequestContext();
    if (!ctx) {
      return this.base; // public routes only — never touch tenant-scoped models
    }
    // Always return the extended client when a request context exists: with a
    // tenant it enforces scoping; without one (platform admin) it fails closed
    // (creates throw, reads return nothing) — platform writes must use `raw`.
    return createTenantScopedClient(this.base, ctx) as unknown as PrismaClient;
  }
}
