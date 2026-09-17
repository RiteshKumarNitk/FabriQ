import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';

/**
 * File storage facade with pluggable drivers:
 *
 *  - 'local' (default): plain local-disk storage, zero dependencies — for
 *    local dev. The serverless filesystem (Vercel etc.) is read-only, so
 *    never use this driver in production.
 *  - 'cloudinary': Cloudinary as a document store via the official SDK.
 *    Files are uploaded as `resource_type: 'raw'` (byte-exact, no image
 *    processing), so the SHA-256 checksum stored by DocumentsService always
 *    matches the delivered bytes. Downloads stay auth-gated through the API.
 *
 * The driver is selected by STORAGE_DRIVER; DocumentsService talks only to
 * this class, so provider details never leak into the application.
 */
@Injectable()
export class FileService {
  private readonly driver: 'local' | 'cloudinary' = env.storage.driver;
  private readonly root: string;

  constructor() {
    this.root = join(process.cwd(), env.storage.localPath);
    if (this.driver === 'cloudinary') {
      cloudinary.config({
        cloud_name: env.storage.cloudinary.cloudName,
        api_key: env.storage.cloudinary.apiKey,
        api_secret: env.storage.cloudinary.apiSecret,
      });
    }
  }

  /** Writes a file at `key` (e.g. "tenantId/entityType/uuid-name.pdf"). */
  async save(key: string, data: Buffer): Promise<{ key: string; sizeBytes: number }> {
    if (this.driver === 'cloudinary') {
      await this.cloudinaryUpload(this.toPublicId(key), data);
      return { key, sizeBytes: data.byteLength };
    }
    const full = this.resolve(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    return { key, sizeBytes: data.byteLength };
  }

  async read(key: string): Promise<{ data: Buffer; mimeType: string }> {
    if (this.driver === 'cloudinary') {
      const publicId = this.toPublicId(key);
      // Raw resources: fetch the delivery URL server-side (the SDK has no
      // byte-body method). Callers that know the real mime type (Documents
      // stores it per row) should prefer it over this fallback.
      const info = (await cloudinary.api.resource(publicId, {
        resource_type: 'raw',
      })) as { secure_url?: string; url?: string };
      const url = info.secure_url ?? info.url;
      if (!url) throw new Error(`Cloudinary resource ${publicId} returned no delivery URL`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Cloudinary delivery fetch failed (${res.status}) for ${publicId}`);
      return { data: Buffer.from(await res.arrayBuffer()), mimeType: 'application/octet-stream' };
    }
    const data = await readFile(this.resolve(key));
    return { data, mimeType: 'application/octet-stream' };
  }

  async remove(key: string): Promise<void> {
    if (this.driver === 'cloudinary') {
      await cloudinary.uploader.destroy(this.toPublicId(key), {
        resource_type: 'raw',
        invalidate: true,
      });
      return;
    }
    await rm(this.resolve(key), { force: true });
  }

  /** Deterministic mapping: DB storageKey → Cloudinary public_id. */
  private toPublicId(key: string): string {
    const folder = env.storage.cloudinary.folder;
    return folder ? `${folder}/${key}` : key;
  }

  private cloudinaryUpload(publicId: string, data: Buffer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw', // byte-exact storage — no image processing
          public_id: publicId,
          overwrite: true,
          invalidate: true,
        },
        (error, result) => {
          if (error || !result) {
            reject(new Error(error?.message ?? `Cloudinary upload failed for ${publicId}`));
            return;
          }
          resolve();
        },
      );
      stream.end(data);
    });
  }

  /** Keys are tenant-scoped and built by the documents module — safe by construction. */
  private resolve(key: string): string {
    return join(this.root, key);
  }
}
