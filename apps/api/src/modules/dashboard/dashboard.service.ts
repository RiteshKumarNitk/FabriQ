import { BadRequestException, Injectable } from '@nestjs/common';
import { getRequestContext } from '@fabriq/database';
import { WorkflowStatus, WorkflowTaskStatus } from '@fabriq/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const ctx = getRequestContext();
    const tenantId = ctx?.tenantId;
    if (!tenantId) throw new BadRequestException('Dashboard requires a tenant context');

    const [
      companies, factories, warehouses, departments, sections, lines,
      users, roles, masterItems, documents,
      pendingTasks,
      suppliers, openRequisitions, openPurchaseOrders, pendingInspections,
    ] = await Promise.all([
      this.prisma.raw.company.count({ where: { tenantId, isDeleted: false } }),
      this.prisma.raw.factory.count({ where: { tenantId, isDeleted: false } }),
      this.prisma.raw.warehouse.count({ where: { tenantId, isDeleted: false } }),
      this.prisma.raw.department.count({ where: { tenantId, isDeleted: false } }),
      this.prisma.raw.section.count({ where: { tenantId, isDeleted: false } }),
      this.prisma.raw.productionLine.count({ where: { tenantId, isDeleted: false } }),
      this.prisma.raw.user.count({ where: { tenantId, isDeleted: false } }),
      this.prisma.raw.role.count({ where: { tenantId, isDeleted: false } }),
      this.prisma.raw.masterDataItem.count({ where: { tenantId, isDeleted: false } }),
      this.prisma.raw.document.count({ where: { tenantId } }),
      this.prisma.raw.workflowTask.count({
        where: {
          tenantId,
          status: WorkflowTaskStatus.PENDING,
          instance: { status: WorkflowStatus.IN_PROGRESS },
        },
      }),
      // Phase 2 — Procurement
      this.prisma.raw.supplier.count({ where: { tenantId, isDeleted: false } }),
      this.prisma.raw.purchaseRequisition.count({
        where: { tenantId, isDeleted: false, status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED'] } },
      }),
      this.prisma.raw.purchaseOrder.count({
        where: { tenantId, isDeleted: false, status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED'] } },
      }),
      this.prisma.raw.grnRoll.count({
        where: { tenantId, status: 'PENDING_INSPECTION' },
      }),
    ]);

    const [recentAudit, recentNotifications] = await Promise.all([
      this.prisma.raw.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdOn: 'desc' },
        take: 8,
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.raw.notification.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdOn: 'desc' },
        take: 5,
      }),
    ]);

    return {
      counts: {
        companies, factories, warehouses, departments, sections, lines,
        users, roles, masterItems, documents, pendingTasks,
        suppliers, openRequisitions, openPurchaseOrders, pendingInspections,
      },
      recentAudit,
      recentNotifications,
    };
  }
}
