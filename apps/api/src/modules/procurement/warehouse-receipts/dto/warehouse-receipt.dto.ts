import { PartialType } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWarehouseReceiptDto {
  @IsString()
  grnRollId: string;

  @IsString()
  warehouseId: string;

  @IsOptional() @IsString() @MaxLength(40)
  rack?: string;

  @IsOptional() @IsString() @MaxLength(40)
  shelf?: string;

  @IsOptional() @IsString() @MaxLength(40)
  bin?: string;

  @IsOptional() @IsDateString()
  receivedOn?: string;
}

export class UpdateWarehouseReceiptDto extends PartialType(CreateWarehouseReceiptDto) {}
