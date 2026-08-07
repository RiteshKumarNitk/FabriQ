import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class WorkflowStepDto {
  @IsInt()
  @Min(1)
  stepOrder: number;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsBoolean()
  isApproval?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  assigneeRoleCode?: string;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;
}

export class CreateWorkflowDefinitionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code may only contain uppercase letters, digits, _ and -' })
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  /** Business entity the workflow applies to, e.g. "purchase-requisition". */
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  entityType: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps: WorkflowStepDto[];
}

export class UpdateWorkflowDefinitionDto extends PartialType(CreateWorkflowDefinitionDto) {}

export class StartWorkflowDto {
  @IsString()
  @MaxLength(100)
  entityType: string;

  @IsString()
  @MaxLength(100)
  entityId: string;

  @IsOptional()
  @IsString()
  definitionId?: string;
}

export class WorkflowTaskActionDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
