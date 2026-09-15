import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { GrainDirection, LengthUnit, MarkerStatus } from '@fabriq/shared';

export class MarkerPieceDto {
  @IsOptional() @IsString()
  id?: string;

  @IsString() @MaxLength(120)
  name: string;

  @IsOptional() @IsString() @MaxLength(30)
  size?: string;

  @IsOptional() @IsString()
  patternPieceId?: string;

  /** Real-world geometry in cm (base unit) — the API never accepts display units here. */
  @IsNumber() @Min(0) @Max(2000)
  xCm: number;

  @IsNumber() @Min(0) @Max(2000)
  yCm: number;

  @IsNumber() @Min(0) @Max(500)
  widthCm: number;

  @IsNumber() @Min(0) @Max(500)
  heightCm: number;

  @IsOptional() @IsNumber() @Min(-360) @Max(360)
  rotationDeg?: number;

  @IsOptional() @IsEnum(GrainDirection)
  grainDirection?: GrainDirection;

  @IsOptional() @IsBoolean()
  mirrored?: boolean;

  @IsOptional() @IsString() @MaxLength(30)
  color?: string;
}

export class CreateMarkerDto {
  @IsOptional() @IsString() @MaxLength(60)
  number?: string;

  @IsOptional() @IsString()
  patternSetId?: string;

  @IsOptional() @IsString() @MaxLength(120)
  styleRef?: string;

  @IsOptional() @IsString() @MaxLength(120)
  fabricType?: string;

  @IsOptional() @IsString() @MaxLength(60)
  color?: string;

  /** e.g. { "M": 2, "L": 2, "XL": 1 } */
  @IsOptional() @IsObject()
  sizeRatio?: Record<string, number>;

  /** Usable width in the given width unit (default cm). */
  @IsNumber() @Min(1)
  width: number;

  @IsOptional() @IsEnum(LengthUnit)
  widthUnit?: LengthUnit;

  /** Optional physical length; derived from pieces when omitted. */
  @IsOptional() @IsNumber() @Min(0)
  length?: number;

  @IsOptional() @IsNumber() @Min(0)
  endAllowance?: number;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;

  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkerPieceDto)
  pieces?: MarkerPieceDto[];
}

export class UpdateMarkerDto extends PartialType(CreateMarkerDto) {
  @IsOptional() @IsEnum(MarkerStatus)
  status?: MarkerStatus;
}

export class FinalizeMarkerDto {
  /** Required acknowledgment when the marker crosses a defect. */
  @IsOptional() @IsBoolean()
  allowDefectOverlap?: boolean;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class MarkerListQueryDto {
  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsEnum(MarkerStatus)
  status?: MarkerStatus;

  @IsOptional() @IsInt() @Min(1)
  page?: number;

  @IsOptional() @IsInt() @Min(1) @Max(100)
  pageSize?: number;
}
