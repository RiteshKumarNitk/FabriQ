import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateSettingsDto {
  /** Key → value map. Values must be JSON primitives. */
  @IsObject()
  values: Record<string, unknown>;

  @IsOptional()
  @IsString()
  group?: string;
}
