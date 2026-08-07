import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Unit } from '@fabriq/shared';

export class PurchaseOrderItemDto {
  @IsOptional() @IsString()
  requisitionItemId?: string;

  @IsString()
  @MaxLength(200)
  itemName: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;

  @IsOptional()
  unit?: Unit;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rate: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  gstPercent?: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  supplierId: string;

  @IsOptional() @IsString()
  requisitionId?: string;

  @IsOptional() @IsDateString()
  poDate?: string;

  @IsOptional() @IsDateString()
  deliveryDate?: string;

  @IsOptional() @IsString() @MaxLength(8)
  currency?: string;

  @IsOptional() @IsString() @MaxLength(120)
  paymentTerms?: string;

  @IsOptional() @IsString() @MaxLength(120)
  deliveryTerms?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  taxPercent?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  discountPercent?: number;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}

export class UpdatePurchaseOrderDto extends PartialType(CreatePurchaseOrderDto) {}
