import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Priority, Unit } from '@fabriq/shared';

export class RequisitionItemDto {
  @IsString()
  @MaxLength(200)
  itemName: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;

  @IsOptional() @IsEnum(Unit)
  unit?: Unit;

  @IsOptional() @IsString() @MaxLength(300)
  remarks?: string;
}

export class CreateRequisitionDto {
  @IsOptional() @IsDateString()
  requestDate?: string;

  @IsOptional() @IsString()
  requestedById?: string;

  @IsOptional() @IsString()
  departmentId?: string;

  @IsOptional() @IsEnum(Priority)
  priority?: Priority;

  @IsOptional() @IsDateString()
  expectedDate?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  remarks?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RequisitionItemDto)
  items: RequisitionItemDto[];
}

export class UpdateRequisitionDto extends PartialType(CreateRequisitionDto) {}

export class ConvertRequisitionDto {
  @IsString()
  supplierId: string;

  @IsOptional() @IsDateString()
  deliveryDate?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

