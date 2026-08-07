import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/pagination.dto';
import { WorkflowsService } from './workflows.service';
import {
  CreateWorkflowDefinitionDto,
  StartWorkflowDto,
  UpdateWorkflowDefinitionDto,
  WorkflowTaskActionDto,
} from './dto/workflow.dto';

@ApiTags('workflows')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  // definitions
  @Get()
  @Permissions('workflow:read')
  listDefinitions(@Query() query: ListQueryDto) {
    return this.workflows.listDefinitions(query);
  }

  @Get('definitions/:id')
  @Permissions('workflow:read')
  getDefinition(@Param('id') id: string) {
    return this.workflows.getDefinition(id);
  }

  @Post('definitions')
  @Permissions('workflow:create')
  createDefinition(@Body() dto: CreateWorkflowDefinitionDto) {
    return this.workflows.createDefinition(dto);
  }

  @Patch('definitions/:id')
  @Permissions('workflow:create')
  updateDefinition(@Param('id') id: string, @Body() dto: UpdateWorkflowDefinitionDto) {
    return this.workflows.updateDefinition(id, dto);
  }

  @Post('definitions/:id/archive')
  @Permissions('workflow:delete')
  archiveDefinition(@Param('id') id: string) {
    return this.workflows.archiveDefinition(id);
  }

  // instances
  @Get('instances')
  @Permissions('workflow:read')
  listInstances(@Query('entityType') entityType?: string, @Query('entityId') entityId?: string) {
    return this.workflows.listInstances(entityType, entityId);
  }

  @Get('instances/:id')
  @Permissions('workflow:read')
  getInstance(@Param('id') id: string) {
    return this.workflows.getInstance(id);
  }

  @Post('instances')
  @Permissions('workflow:approve')
  startInstance(@Body() dto: StartWorkflowDto) {
    return this.workflows.startInstance(dto);
  }

  // my tasks
  @Get('tasks')
  @Permissions('workflow:read')
  listMyTasks(@Query() query: ListQueryDto) {
    return this.workflows.listMyTasks(query);
  }

  @Post('tasks/:id/action')
  @Permissions('workflow:approve')
  actOnTask(@Param('id') id: string, @Body() dto: WorkflowTaskActionDto) {
    return this.workflows.actOnTask(id, dto.action, dto.comment);
  }
}
