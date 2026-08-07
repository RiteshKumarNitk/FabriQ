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
import { RollCondition } from '@fabriq/shared';

export class GrnRollDto {
  @IsString()
  @MaxLength(40)
  rollNumber: string;

  @IsOptional() @IsString()
  purchaseOrderItemId?: string;

  @IsOptional() @IsString() @MaxLength(120)
  fabricType?: string;

  @IsOptional() @IsString() @MaxLength(60)
  color?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  gsm?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  width?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  length?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  weight?: number;

  @IsOptional() @IsString() @MaxLength(40)
  batch?: string;

  @IsOptional() @IsString() @MaxLength(40)
  lot?: string;

  @IsOptional() @IsString() @MaxLength(80)
  barcode?: string;

  @IsOptional() @IsString() @MaxLength(80)
  qrCode?: string;

  @IsOptional() @IsEnum(RollCondition)
  condition?: RollCondition;

  @IsOptional() @IsString() @MaxLength(300)
  remarks?: string;
}

export class CreateGoodsReceiptDto {
  @IsString()
  purchaseOrderId: string;

  @IsOptional() @IsString()
  supplierId?: string;

  @IsOptional() @IsString() @MaxLength(80)
  invoiceNumber?: string;

  @IsOptional() @IsDateString()
  invoiceDate?: string;

  @IsOptional() @IsString() @MaxLength(40)
  vehicleNumber?: string;

  @IsOptional() @IsDateString()
  receivedDate?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  remarks?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GrnRollDto)
  rolls: GrnRollDto[];
}

export class UpdateGoodsReceiptDto extends PartialType(CreateGoodsReceiptDto) {}
