import { Logger, ValidationPipe, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: '/', method: RequestMethod.GET }],
  });
  app.use(helmet());
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
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(env.port);
  Logger.log(`FabriQ API listening on http://localhost:${env.port}/api/v1`, 'Bootstrap');
  Logger.log(`Swagger docs on http://localhost:${env.port}/api/docs`, 'Bootstrap');
}

void bootstrap();
