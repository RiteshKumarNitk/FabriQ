import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class CreateMasterDataCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code may only contain uppercase letters, digits, _ and -' })
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class UpdateMasterDataCategoryDto extends PartialType(CreateMasterDataCategoryDto) {}

export class CreateMasterDataItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateMasterDataItemDto extends PartialType(CreateMasterDataItemDto) {}

/** POST /master-data/items — flat create used by the admin UI (category in body). */
export class CreateItemWithCategoryDto extends CreateMasterDataItemDto {
  @IsString()
  @IsNotEmpty()
  categoryId: string;
}
