import { PartialType } from '@nestjs/swagger';
import { IsArray, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength, ArrayUnique } from 'class-validator';
import { UserStatus } from '@fabriq/shared';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  factoryId?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds?: string[];

  /** Only honored when a platform admin (no tenant context) creates the user. */
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  /** Password cannot be changed through the update payload. */
  @IsOptional()
  password?: never;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}
