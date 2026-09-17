import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DefectType, InspectionDecision } from '@fabriq/shared';

export class InspectionDefectDto {
  @IsString()
  @MaxLength(120)
  defectName: string;

  /** Defect length along the fabric (base cm) — drives size-based scoring. */
  @IsOptional() @IsNumber() @Min(0)
  sizeCm?: number;

  /** Type of defect (HOLE types always score the maximum 4 points). */
  @IsOptional() @IsEnum(DefectType)
  defectType?: DefectType;

  /** 1–4 points per the 4-point inspection system (optional — derived from size when omitted). */
  @IsOptional() @IsInt() @Min(1) @Max(4)
  points?: number;

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
