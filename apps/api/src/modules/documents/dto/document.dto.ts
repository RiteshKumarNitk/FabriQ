import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentCategory } from '@fabriq/shared';

export class UploadDocumentDto {
  @IsString()
  @MaxLength(100)
  entityType: string;

  @IsString()
  @MaxLength(100)
  entityId: string;

  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;
}
