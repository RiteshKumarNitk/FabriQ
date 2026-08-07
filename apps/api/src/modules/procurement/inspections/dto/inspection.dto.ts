import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { InspectionDecision } from '@fabriq/shared';

export class InspectionDefectDto {
  @IsString()
  @MaxLength(120)
  defectName: string;

  /** 1–4 points per the 4-point inspection system. */
  @IsInt()
  @Min(1)
  @Max(4)
  points: number;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;
}

export class CreateInspectionDto {
  @IsString()
  grnRollId: string;

  @IsOptional() @IsString()
  inspectorId?: string;

  @IsOptional() @IsDateString()
  inspectionDate?: string;

  @IsOptional() @IsEnum(InspectionDecision)
  decision?: InspectionDecision;

  @IsOptional() @IsString() @MaxLength(2000)
  remarks?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectionDefectDto)
  defects: InspectionDefectDto[];
}

export class UpdateInspectionDto extends PartialType(CreateInspectionDto) {}
