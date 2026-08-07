import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

import { JwtAuthGuard } from './common/jwt-auth.guard';
import { RbacGuard } from './common/rbac.guard';
import { ResponseInterceptor } from './common/response.interceptor';
import { AuditInterceptor } from './common/audit.interceptor';
import { TenantContextInterceptor } from './common/tenant-context.interceptor';
import { HttpExceptionFilter } from './common/http-exception.filter';

import { TenantsModule } from './modules/tenants/tenants.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { FactoriesModule } from './modules/factories/factories.module';
import { OrgUnitsModule } from './modules/org-units/org-units.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { SettingsModule } from './modules/settings/settings.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { AuditModule } from './modules/audit/audit.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CommentsModule } from './modules/comments/comments.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { StockModule } from './modules/stock/stock.module';
import { PlatformModule } from './modules/platform/platform.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,

    TenantsModule,
    CompaniesModule,
    FactoriesModule,
    OrgUnitsModule,
    WarehousesModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    SettingsModule,
    MasterDataModule,
    AuditModule,
    DocumentsModule,
    NotificationsModule,
    CommentsModule,
    WorkflowsModule,
    DashboardModule,
    ProcurementModule,
    StockModule,
    PlatformModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
