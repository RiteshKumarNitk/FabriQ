import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { getRequestContext } from '@fabriq/database';
import { DocumentCategory } from '@fabriq/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { FileService } from '../../common/file.service';

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB — enforced by multer and the service

export interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FileService,
  ) {}

  async upload(file: UploadedFileShape, entityType: string, entityId: string, category?: DocumentCategory) {
    if (!file?.buffer) throw new BadRequestException('No file received');
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File exceeds the 50 MB limit');
    }
    const ctx = getRequestContext();
    const tenantId = ctx?.tenantId;
    if (!tenantId) throw new BadRequestException('Upload requires a tenant context');

    const storageKey = `${tenantId}/${entityType}/${randomUUID()}${extname(file.originalname)}`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    const stored = await this.files.save(storageKey, file.buffer);

    const doc = await this.prisma.raw.document.create({
      data: {
        tenantId,
        companyId: ctx?.companyId ?? null,
        factoryId: ctx?.factoryId ?? null,
        category: category ?? DocumentCategory.GENERAL,
        entityType,
        entityId,
        fileName: file.originalname,
        storageKey: stored.key,
        mimeType: file.mimetype,
        sizeBytes: stored.sizeBytes,
        checksum,
        uploadedBy: ctx?.userId ?? null,
      },
    });
    return doc;
  }

  async list(entityType?: string, entityId?: string) {
    const ctx = getRequestContext();
    const tenantId = ctx?.tenantId;
    if (!tenantId) throw new BadRequestException('Documents require a tenant context');
    return this.prisma.raw.document.findMany({
      where: {
        tenantId,
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { uploadedOn: 'desc' },
    });
  }

  async download(id: string): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
    const doc = await this.assertAccessible(id);
    const { data, mimeType } = await this.files.read(doc.storageKey);
    return { data, mimeType, fileName: doc.fileName };
  }

  async archive(id: string) {
    const doc = await this.assertAccessible(id);
    await this.files.remove(doc.storageKey);
    await this.prisma.raw.document.delete({ where: { id: doc.id } });
    return { success: true, id };
  }

  /** Ensures the document belongs to the caller's tenant. */
  private async assertAccessible(id: string) {
    const ctx = getRequestContext();
    const tenantId = ctx?.tenantId;
    if (!tenantId) throw new BadRequestException('Documents require a tenant context');
    const doc = await this.prisma.raw.document.findFirst({ where: { id, tenantId } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }
}
