import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MaxLength(100)
  entityType: string;

  @IsString()
  @MaxLength(100)
  entityId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
