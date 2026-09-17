import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { EntityStatus, LengthUnit } from '@fabriq/shared';

export class CreateFabricDto {
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code may only contain uppercase letters, digits, _ and -' })
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional() @IsString() @MaxLength(100)
  fabricType?: string;

  @IsOptional() @IsString() @MaxLength(200)
  composition?: string;

  @IsOptional() @IsNumber() @Min(0)
  gsm?: number;

  /** Default nominal width, expressed in defaultWidthUnit (converted to cm on save). */
  @IsOptional() @IsNumber() @Min(0)
  defaultWidth?: number;

  @IsOptional() @IsEnum(LengthUnit)
  defaultWidthUnit?: LengthUnit;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsEnum(EntityStatus)
  status?: EntityStatus;
}

export class UpdateFabricDto extends PartialType(CreateFabricDto) {}
