import { config as loadEnv } from 'dotenv';

// Load .env before any env access — this module is evaluated at import time,
// before Nest's ConfigModule runs during bootstrap. Both cwd (.env) and the
// monorepo root (../../.env, when run from apps/api) are covered.
loadEnv({ path: '.env' });
loadEnv({ path: '../../.env' });

/**
 * Centralized, typed access to environment configuration. No module reads
 * process.env directly — everything flows through this object so the
 * configuration surface is explicit and testable.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  isProduction: optional('NODE_ENV', 'development') === 'production',
  port: parseInt(optional('PORT', '3001'), 10),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpiresIn: optional('JWT_ACCESS_EXPIRES_IN', '15m'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '7d'),
  },
  webOrigins: optional('WEB_ORIGIN', 'http://localhost:3000,http://127.0.0.1:3000').split(',').map((s) => s.trim()),
  // Public URL of the deployed web app (the login page is the default entry
  // point — the API root redirects here). Overridable via WEB_APP_URL. NOTE:
  // never point this at the API's own domain (fabri-q.vercel.app) while the API
  // serves it — that would create a redirect loop.
  webAppUrl: optional('WEB_APP_URL', 'https://fabriq.vercel.app'),
  // Document storage. STORAGE_DRIVER selects the FileService backend:
  // 'local' for dev, 'cloudinary' for production (serverless hosts have a
  // read-only filesystem).
  storage: {
    /**
     * 'local' (default) writes to the local filesystem (dev only — serverless
     * filesystems like Vercel are read-only). 'cloudinary' stores files in
     * Cloudinary as raw resources via the official SDK.
     */
    driver: optional('STORAGE_DRIVER', 'local') as 'local' | 'cloudinary',
    localPath: optional('STORAGE_LOCAL_PATH', './uploads'),
    cloudinary: {
      cloudName: requiredIf('CLOUDINARY_CLOUD_NAME', 'cloudinary'),
      apiKey: requiredIf('CLOUDINARY_API_KEY', 'cloudinary'),
      apiSecret: requiredIf('CLOUDINARY_API_SECRET', 'cloudinary'),
      /** Optional folder prefix inside Cloudinary (e.g. 'fabriq-documents'). */
      folder: process.env.CLOUDINARY_FOLDER,
    },
  },
};

/**
 * Reads an env var, but only throws when `driverName` is actually selected —
 * lets .env files keep all driver sections present without boot errors.
 */
function requiredIf(name: string, driverName: string): string | undefined {
  const value = process.env[name];
  if (!value && process.env.STORAGE_DRIVER === driverName) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
