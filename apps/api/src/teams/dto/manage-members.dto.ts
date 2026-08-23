import { ArrayUnique, IsArray, IsOptional, IsUUID } from 'class-validator';

export class ManageMembersDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  add?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  remove?: string[];
}
