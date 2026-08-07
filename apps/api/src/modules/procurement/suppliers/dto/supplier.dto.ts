import { PartialType } from '@nestjs/swagger';
import { IsArray, IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { EntityStatus } from '@fabriq/shared';

export class CreateSupplierDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code may only contain uppercase letters, digits, _ and -' })
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional() @IsString() @MaxLength(200)
  businessName?: string;

  @IsOptional() @IsString() @MaxLength(20)
  gstin?: string;

  @IsOptional() @IsString() @MaxLength(20)
  pan?: string;

  @IsOptional() @IsString() @MaxLength(120)
  contactPerson?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MaxLength(20)
  mobile?: string;

  @IsOptional() @IsString() @MaxLength(20)
  officePhone?: string;

  @IsOptional() @IsString() @MaxLength(200)
  website?: string;

  @IsOptional() @IsString() @MaxLength(500)
  billingAddress?: string;

  @IsOptional() @IsString() @MaxLength(500)
  shippingAddress?: string;

  @IsOptional() @IsString() @MaxLength(80)
  country?: string;

  @IsOptional() @IsString() @MaxLength(80)
  state?: string;

  @IsOptional() @IsString() @MaxLength(80)
  city?: string;

  @IsOptional() @IsString() @MaxLength(12)
  pincode?: string;

  @IsOptional() @IsString() @MaxLength(120)
  paymentTerms?: string;

  @IsOptional() @IsInt() @Min(0)
  creditDays?: number;

  @IsOptional() @IsString() @MaxLength(8)
  currency?: string;

  @IsOptional() @IsString() @MaxLength(120)
  bankName?: string;

  @IsOptional() @IsString() @MaxLength(40)
  bankAccountNumber?: string;

  @IsOptional() @IsString() @MaxLength(20)
  bankIfsc?: string;

  @IsOptional() @IsString() @MaxLength(120)
  bankBranch?: string;

  @IsOptional() @IsEnum(EntityStatus)
  status?: EntityStatus;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  /** [{ name, designation, email, phone, isPrimary }] */
  @IsOptional() @IsArray()
  contacts?: Array<Record<string, unknown>>;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
