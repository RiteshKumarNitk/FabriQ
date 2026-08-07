import { PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { ProductionLineStatus } from '@fabriq/shared';

export class CreateDepartmentDto {
  @IsUUID()
  factoryId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code may only contain uppercase letters, digits, _ and -' })
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;
}

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}

export class CreateSectionDto {
  @IsUUID()
  departmentId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code may only contain uppercase letters, digits, _ and -' })
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;
}

export class UpdateSectionDto extends PartialType(CreateSectionDto) {}

export class CreateLineDto {
  @IsUUID()
  factoryId: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code may only contain uppercase letters, digits, _ and -' })
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  status?: ProductionLineStatus;
}

export class UpdateLineDto extends PartialType(CreateLineDto) {}
