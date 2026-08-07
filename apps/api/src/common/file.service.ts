import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env } from '../config/env';

/**
 * Plain local-disk file storage.
 *
 * Deliberately YAGNI: no storage interface, no provider factory. The
 * DocumentsService talks only to this class, so when a real customer asks
 * for Cloudinary/S3 we swap the internals (or add a constructor-injected
 * provider) without touching the rest of the application.
 */
@Injectable()
export class FileService {
  private readonly root: string;

  constructor() {
    this.root = join(process.cwd(), env.storage.localPath);
  }

  /** Writes a file at `key` (e.g. "tenantId/entityType/uuid-name.pdf"). */
  async save(key: string, data: Buffer): Promise<{ key: string; sizeBytes: number }> {
    const full = this.resolve(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    return { key, sizeBytes: data.byteLength };
  }

  async read(key: string): Promise<{ data: Buffer; mimeType: string }> {
    const data = await readFile(this.resolve(key));
    return { data, mimeType: 'application/octet-stream' };
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  /** Keys are tenant-scoped and built by the documents module — safe by construction. */
  private resolve(key: string): string {
    return join(this.root, key);
  }
}
