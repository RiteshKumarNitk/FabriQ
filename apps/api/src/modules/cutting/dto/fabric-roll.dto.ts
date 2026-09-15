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
import {
  DefectSeverity,
  DefectStatus,
  DefectType,
  FabricRollStatus,
  LengthUnit,
} from '@fabriq/shared';

export class CreateFabricRollDto {
  @IsOptional() @IsString() @MaxLength(60)
  number?: string; // optional — auto-generated when omitted

  @IsOptional() @IsString() @MaxLength(120)
  fabricName?: string;

  @IsOptional() @IsString() @MaxLength(120)
  fabricType?: string;

  @IsOptional() @IsString() @MaxLength(60)
  color?: string;

  @IsOptional() @IsString() @MaxLength(60)
  shadeLot?: string;

  @IsOptional() @IsString() @MaxLength(120)
  supplierRef?: string;

  @IsOptional() @IsString()
  grnRollId?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(2000)
  gsm?: number;

  /** Physical roll length in the roll's display unit. Converted to cm server-side. */
  @IsNumber() @Min(0)
  length: number;

  @IsOptional() @IsEnum(LengthUnit)
  lengthUnit?: LengthUnit;

  /** Nominal width in the width display unit (default inches). */
  @IsNumber() @Min(0)
  width: number;

  @IsOptional() @IsNumber() @Min(0)
  usableWidth?: number;

  @IsOptional() @IsEnum(LengthUnit)
  widthUnit?: LengthUnit;

  @IsOptional() @IsNumber() @Min(0)
  weightKg?: number;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}

export class UpdateFabricRollDto extends PartialType(CreateFabricRollDto) {
  @IsOptional() @IsEnum(FabricRollStatus)
  status?: FabricRollStatus;
}

export class WidthReadingDto {
  @IsNumber() @Min(0)
  value: number;
}

export class AddMeasurementDto {
  /** Measured roll length in the roll's length display unit. */
  @IsNumber() @Min(0)
  length: number;

  @IsOptional() @IsNumber() @Min(0)
  beginWidth?: number;

  @IsOptional() @IsNumber() @Min(0)
  middleWidth?: number;

  @IsOptional() @IsNumber() @Min(0)
  endWidth?: number;

  /** Extra width readings (same unit as widths). */
  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WidthReadingDto)
  extraWidths?: WidthReadingDto[];

  /** Operator-confirmed usable width (must be ≤ nominal width). */
  @IsNumber() @Min(0)
  usableWidth: number;

  @IsOptional() @IsDateString()
  measuredOn?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class CreateDefectDto {
  @IsOptional() @IsEnum(DefectType)
  defectType?: DefectType;

  /** Position along the roll, cm (base unit) — the canvas always works in cm. */
  @IsNumber() @Min(0)
  startCm: number;

  @IsNumber() @Min(0)
  endCm: number;

  /** Width affected in cm (0 = full width). */
  @IsOptional() @IsNumber() @Min(0)
  affectedWidthCm?: number;

  @IsOptional() @IsEnum(DefectSeverity)
  severity?: DefectSeverity;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}

export class UpdateDefectDto extends PartialType(CreateDefectDto) {
  @IsOptional() @IsEnum(DefectStatus)
  status?: DefectStatus;
}

export class AdjustmentDto {
  /** Signed correction in cm (positive adds back, negative removes). */
  @IsNumber()
  quantityCm: number;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class RollListQueryDto {
  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsEnum(FabricRollStatus)
  status?: FabricRollStatus;

  @IsOptional() @IsInt() @Min(1)
  page?: number;

  @IsOptional() @IsInt() @Min(1) @Max(100)
  pageSize?: number;
}
