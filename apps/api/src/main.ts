import { Logger, ValidationPipe, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';
import {
  DOCS_INIT_JS,
  DOCS_INIT_JS_PATH,
  DOCS_JSON_PATH,
  DOCS_PAGE_HTML,
} from './docs/docs-page';
import { buildStatusPage, STATUS_JS, STATUS_JS_PATH } from './docs/status-page';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: '/', method: RequestMethod.GET }],
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // The docs page (/api/docs) loads Swagger UI from the jsDelivr CDN
          // and injects inline styles. Everything else stays 'self'-only.
          scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
        },
      },
    }),
  );
  app.enableCors({
    origin: env.webOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('FabriQ API')
    .setDescription('Enterprise multi-tenant garment manufacturing management platform — Phase 1 Platform Foundation')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication & sessions')
    .addTag('tenants', 'Platform tenant management')
    .addTag('organization', 'Companies, factories, warehouses, org structure')
    .addTag('identity', 'Users, roles, permissions')
    .addTag('configuration', 'Settings & master data')
    .addTag('documents', 'Document upload/download')
    .addTag('workflows', 'Approval workflow engine')
    .addTag('audit', 'Audit log')
    .addTag('system', 'Health')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const expressApp = app.getHttpAdapter().getInstance();

  // Root: the web app (login page) is the default entry point — redirect there.
  // The API status/report page moved to /status.
  const statusPageHtml = buildStatusPage(env.webAppUrl, env.nodeEnv);
  expressApp.get('/', (_req: Request, res: Response) => {
    res.redirect(302, env.webAppUrl || '/status');
  });
  expressApp.get('/status', (_req: Request, res: Response) =>
    res.type('text/html').send(statusPageHtml),
  );
  // Live status bootstrap for the status page (external file: CSP-safe).
  expressApp.get(STATUS_JS_PATH, (_req: Request, res: Response) =>
    res.type('application/javascript').send(STATUS_JS),
  );

  // Docs are served by hand (a self-contained HTML string + the raw OpenAPI
  // JSON) instead of SwaggerModule.setup, whose UI assets are streamed from
  // node_modules/swagger-ui-dist and 404 on Vercel serverless functions.
  expressApp.get('/api/docs', (_req: Request, res: Response) =>
    res.type('text/html').send(DOCS_PAGE_HTML),
  );
  expressApp.get('/api/docs/', (_req: Request, res: Response) =>
    res.type('text/html').send(DOCS_PAGE_HTML),
  );
  expressApp.get(DOCS_JSON_PATH, (_req: Request, res: Response) =>
    res.type('application/json').send(document),
  );
  // Swagger UI bootstrap as a 'self'-served file so it passes the strict CSP
  // (an inline <script> would be blocked: no 'unsafe-inline' in script-src).
  expressApp.get(DOCS_INIT_JS_PATH, (_req: Request, res: Response) =>
    res.type('application/javascript').send(DOCS_INIT_JS),
  );

  await app.listen(env.port);
  Logger.log(`FabriQ API listening on http://localhost:${env.port}/api/v1`, 'Bootstrap');
  Logger.log(`Swagger docs on http://localhost:${env.port}/api/docs`, 'Bootstrap');
}

void bootstrap();
