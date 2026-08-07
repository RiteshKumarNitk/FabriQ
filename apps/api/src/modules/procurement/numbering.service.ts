import { BadRequestException, Injectable } from '@nestjs/common';
import { getRequestContext } from '@fabriq/database';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Per-tenant sequential document numbering (e.g. PR-2026-0001).
 *
 * The counter row is upserted with an atomic `increment` inside a
 * transaction, so concurrent calls can never produce duplicate numbers.
 * Numbers are unique per (tenant, year-prefix) — see @@unique on
 * DocumentSequence — which is what makes them safe to display in lists.
 */
@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  async next(prefix: string): Promise<string> {
    const tenantId = getRequestContext()?.tenantId;
    if (!tenantId) throw new BadRequestException('Document numbering requires a tenant context');
    const year = new Date().getFullYear();
    const key = `${prefix}-${year}`;
    return this.prisma.raw.$transaction(async (tx) => {
      const seq = await tx.documentSequence.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: { tenantId, key, prefix, year, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      return `${prefix}-${year}-${String(seq.lastNumber).padStart(4, '0')}`;
    });
  }
}
