import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getRequestContext } from '@fabriq/database';
import { NotificationType, UserStatus, WorkflowStatus, WorkflowTaskStatus } from '@fabriq/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ListQueryDto } from '../../common/pagination.dto';
import { buildListArgs, buildPaginationMeta } from '../../common/list-args';
import { CreateWorkflowDefinitionDto, StartWorkflowDto, UpdateWorkflowDefinitionDto } from './dto/workflow.dto';

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Definitions ─────────────────────────────────────────────────────────

  async listDefinitions(dto: ListQueryDto) {
    const args = buildListArgs(dto, {
      searchFields: ['code', 'name', 'entityType'],
      model: 'WorkflowDefinition',
      where: { isDeleted: false },
      defaultSortBy: 'createdOn',
    });
    const [items, total] = await Promise.all([
      this.prisma.raw.workflowDefinition.findMany({
        where: { ...args.where, tenantId: this.ctxTenant() },
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        include: { _count: { select: { steps: true } } },
      }),
      this.prisma.raw.workflowDefinition.count({
        where: { ...args.where, tenantId: this.ctxTenant() },
      }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }

  async getDefinition(id: string) {
    const definition = await this.prisma.raw.workflowDefinition.findFirst({
      where: { id, tenantId: this.ctxTenant(), isDeleted: false },
      include: { steps: { where: { isDeleted: false }, orderBy: { stepOrder: 'asc' } } },
    });
    if (!definition) throw new NotFoundException('Workflow definition not found');
    return definition;
  }

  async createDefinition(dto: CreateWorkflowDefinitionDto) {
    const { steps, ...rest } = dto;
    return this.prisma.raw.$transaction(async (tx) => {
      const definition = await tx.workflowDefinition.create({
        data: {
          ...rest,
          tenantId: this.ctxTenant(),
          createdBy: this.ctx?.userId ?? null,
          updatedBy: this.ctx?.userId ?? null,
        },
      });
      await tx.workflowStep.createMany({
        data: steps.map((s) => ({
          ...s,
          tenantId: this.ctxTenant(),
          workflowDefinitionId: definition.id,
        })),
      });
      return this.getDefinition(definition.id);
    });
  }

  async updateDefinition(id: string, dto: UpdateWorkflowDefinitionDto) {
    const { steps, ...rest } = dto;
    await this.getDefinition(id);
    if (steps) {
      // Steps are referenced by live tasks via a hard FK — replacing them while
      // instances are in flight would fail. Reject and ask for a new definition.
      const taskCount = await this.prisma.raw.workflowTask.count({
        where: { tenantId: this.ctxTenant(), instance: { workflowDefinitionId: id } },
      });
      if (taskCount > 0) {
        throw new BadRequestException(
          'Cannot change steps while workflow instances are in flight — create a new definition instead.',
        );
      }
    }
    return this.prisma.raw.$transaction(async (tx) => {
      const definition = await tx.workflowDefinition.update({
        where: { id },
        data: { ...rest, updatedBy: this.ctx?.userId ?? null, version: { increment: 1 } },
      });
      if (steps) {
        await tx.workflowStep.deleteMany({ where: { workflowDefinitionId: id } });
        await tx.workflowStep.createMany({
          data: steps.map((s) => ({
            ...s,
            tenantId: this.ctxTenant(),
            workflowDefinitionId: id,
          })),
        });
      }
      return this.getDefinition(definition.id);
    });
  }

  async archiveDefinition(id: string) {
    await this.getDefinition(id);
    return this.prisma.raw.workflowDefinition.update({
      where: { id },
      data: { isDeleted: true, deletedBy: this.ctx?.userId ?? null, deletedOn: new Date() },
    });
  }

  // ── Instances & tasks ───────────────────────────────────────────────────

  async startInstance(dto: StartWorkflowDto) {
    const definition = dto.definitionId
      ? await this.getDefinition(dto.definitionId)
      : await this.prisma.raw.workflowDefinition.findFirst({
          where: { tenantId: this.ctxTenant(), entityType: dto.entityType, isActive: true, isDeleted: false },
          include: { steps: { where: { isDeleted: false }, orderBy: { stepOrder: 'asc' } } },
        });
    if (!definition || definition.steps.length === 0) {
      throw new BadRequestException('No active workflow definition with steps found for this entity type');
    }
    const existing = await this.prisma.raw.workflowInstance.findFirst({
      where: {
        tenantId: this.ctxTenant(),
        entityType: dto.entityType,
        entityId: dto.entityId,
        status: { in: [WorkflowStatus.IN_PROGRESS, WorkflowStatus.DRAFT] },
      },
    });
    if (existing) throw new BadRequestException('A workflow instance is already in progress for this entity');

    const instance = await this.prisma.raw.workflowInstance.create({
      data: {
        tenantId: this.ctxTenant(),
        workflowDefinitionId: definition.id,
        entityType: dto.entityType,
        entityId: dto.entityId,
        status: WorkflowStatus.IN_PROGRESS,
        createdBy: this.ctx?.userId ?? null,
        updatedBy: this.ctx?.userId ?? null,
      },
    });
    const firstStep = definition.steps[0];
    await this.createTask(instance.id, firstStep.id, firstStep);
    await this.notifyStepAssignees(firstStep, definition.name, dto.entityType);
    return this.getInstance(instance.id);
  }

  async listMyTasks(dto: ListQueryDto) {
    const ctx = getRequestContext();
    const where: Record<string, unknown> = {
      status: WorkflowTaskStatus.PENDING,
      instance: { isDeleted: false, status: WorkflowStatus.IN_PROGRESS },
    };
    if (ctx?.tenantId) where['tenantId'] = ctx.tenantId;
    where['OR'] = [
      { assigneeUserId: ctx?.userId ?? '__none__' },
      ...(ctx?.roles?.length ? ctx.roles.map((role) => ({ assigneeRoleCode: role })) : []),
    ];
    const args = buildListArgs(dto, { model: 'WorkflowTask', where, defaultSortBy: 'createdOn', defaultSortOrder: 'desc' });
    const [items, total] = await Promise.all([
      this.prisma.raw.workflowTask.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        include: {
          instance: { include: { workflow: true } },
          step: true,
        },
      }),
      this.prisma.raw.workflowTask.count({ where: args.where }),
    ]);
    return { items, meta: buildPaginationMeta(args.page, args.pageSize, total) };
  }

  async actOnTask(taskId: string, action: 'approve' | 'reject', comment?: string) {
    const ctx = getRequestContext();
    const task = await this.prisma.raw.workflowTask.findFirst({
      where: { id: taskId, tenantId: this.ctxTenant(), status: WorkflowTaskStatus.PENDING },
      include: {
        step: true,
        instance: { include: { workflow: { include: { steps: { where: { isDeleted: false }, orderBy: { stepOrder: 'asc' } } } } } },
      },
    });
    if (!task) throw new NotFoundException('Pending task not found');

    const eligible =
      task.assigneeUserId === ctx?.userId ||
      (!!task.assigneeRoleCode && (ctx?.roles ?? []).includes(task.assigneeRoleCode)) ||
      ctx?.isPlatformAdmin === true;
    if (!eligible) throw new ForbiddenException('This task is not assigned to you');

    const instance = task.instance;
    const steps = instance.workflow.steps;

    await this.prisma.raw.$transaction(async (tx) => {
      // Optimistic guard: only one actor can action a task.
      const acted = await tx.workflowTask.updateMany({
        where: { id: taskId, status: WorkflowTaskStatus.PENDING },
        data: {
          status: action === 'approve' ? WorkflowTaskStatus.APPROVED : WorkflowTaskStatus.REJECTED,
          comment: comment ?? null,
          actedBy: ctx?.userId ?? null,
          actedAt: new Date(),
        },
      });
      if (acted.count === 0) {
        throw new BadRequestException('This task was already actioned by someone else');
      }

      if (action === 'reject') {
        await tx.workflowInstance.update({
          where: { id: instance.id },
          data: { status: WorkflowStatus.REJECTED, updatedBy: ctx?.userId ?? null, version: { increment: 1 } },
        });
        await this.notifications.send({
          userId: instance.createdBy ?? ctx!.userId,
          tenantId: instance.tenantId,
          type: NotificationType.APPROVAL,
          title: `Workflow rejected: ${instance.workflow.name}`,
          body: comment ?? 'No comment provided',
          link: `/admin/tasks`,
        });
        return;
      }

      const nextStep = steps.find((s: any) => s.stepOrder === task.step.stepOrder + 1);
      if (nextStep) {
        await tx.workflowInstance.update({
          where: { id: instance.id },
          data: { currentStepId: nextStep.id, updatedBy: ctx?.userId ?? null, version: { increment: 1 } },
        });
        await tx.workflowTask.create({
          data: {
            tenantId: instance.tenantId,
            workflowInstanceId: instance.id,
            stepId: nextStep.id,
            assigneeUserId: null,
            assigneeRoleCode: nextStep.assigneeRoleCode ?? null,
          },
        });
        await this.notifyStepAssignees(nextStep, instance.workflow.name, instance.entityType);
      } else {
        await tx.workflowInstance.update({
          where: { id: instance.id },
          data: { status: WorkflowStatus.APPROVED, updatedBy: ctx?.userId ?? null, version: { increment: 1 } },
        });
        await this.notifications.send({
          userId: instance.createdBy ?? ctx!.userId,
          tenantId: instance.tenantId,
          type: NotificationType.APPROVAL,
          title: `Workflow approved: ${instance.workflow.name}`,
          body: 'All steps completed.',
          link: `/admin/tasks`,
        });
      }
    });

    return this.getInstance(instance.id);
  }

  async getInstance(id: string) {
    const instance = await this.prisma.raw.workflowInstance.findFirst({
      where: { id, tenantId: this.ctxTenant() },
      include: {
        workflow: true,
        tasks: { include: { step: true }, orderBy: { createdOn: 'asc' } },
      },
    });
    if (!instance) throw new NotFoundException('Workflow instance not found');
    return instance;
  }

  async listInstances(entityType?: string, entityId?: string) {
    return this.prisma.raw.workflowInstance.findMany({
      where: { tenantId: this.ctxTenant(), ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}) },
      include: { workflow: true, tasks: { include: { step: true } } },
      orderBy: { createdOn: 'desc' },
    });
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private ctxTenant(): string {
    const tenantId = getRequestContext()?.tenantId;
    if (!tenantId) throw new BadRequestException('Workflows require a tenant context');
    return tenantId;
  }

  private get ctx() {
    return getRequestContext();
  }

  private async createTask(instanceId: string, stepId: string, step: any) {
    return this.prisma.raw.workflowTask.create({
      data: {
        tenantId: this.ctxTenant(),
        workflowInstanceId: instanceId,
        stepId,
        assigneeUserId: null,
        assigneeRoleCode: step.assigneeRoleCode ?? null,
      },
    });
  }

  private async notifyStepAssignees(step: any, workflowName: string, entityType: string) {
    const tenantId = this.ctxTenant();
    let recipients: string[] = [];
    if ((step as any).assigneeUserId) {
      recipients = [(step as any).assigneeUserId];
    } else if (step.assigneeRoleCode) {
      const users = await this.prisma.raw.user.findMany({
        where: {
          tenantId,
          isDeleted: false,
          status: { in: [UserStatus.ACTIVE, UserStatus.PENDING] },
          roles: { some: { role: { code: step.assigneeRoleCode } } },
        },
        select: { id: true },
      });
      recipients = users.map((u) => u.id);
    }
    for (const userId of recipients) {
      await this.notifications.send({
        userId,
        tenantId,
        type: NotificationType.TASK,
        title: `Action required: ${workflowName}`,
        body: `Step "${step.name}" is waiting on you (${entityType}).`,
        link: '/admin/tasks',
      });
    }
  }
}
