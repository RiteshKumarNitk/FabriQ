import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EntityStatus, GrainDirection } from '@fabriq/shared';

export class PatternPieceDto {
  @IsString() @MinLength(1) @MaxLength(120)
  name: string;

  @IsOptional() @IsString() @MaxLength(60)
  size?: string;

  /** Real-world piece dimensions in base cm (width along the grain). */
  @IsNumber() @Min(0)
  widthCm: number;

  @IsNumber() @Min(0)
  heightCm: number;

  /** Pieces of this kind per garment (a shirt has 2 sleeves). */
  @IsOptional() @IsInt() @Min(1)
  quantity?: number;

  @IsOptional() @IsEnum(GrainDirection)
  grainDirection?: GrainDirection;

  @IsOptional()
  rotationAllowed?: boolean;

  @IsOptional()
  mirrored?: boolean;

  @IsOptional() @IsNumber() @Min(0)
  seamAllowanceCm?: number;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}

export class CreatePatternSetDto {
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code may only contain uppercase letters, digits, _ and -' })
  code: string;

  @IsString() @MinLength(2) @MaxLength(200)
  name: string;

  @IsOptional() @IsString() @MaxLength(120)
  styleRef?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsEnum(EntityStatus)
  status?: EntityStatus;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatternPieceDto)
  pieces?: PatternPieceDto[];
}

export class UpdatePatternSetDto extends PartialType(CreatePatternSetDto) {}

export class ApplyToMarkerDto {
  @IsString()
  markerId: string;

  @IsOptional()
  includeSeamAllowance?: boolean;
}
