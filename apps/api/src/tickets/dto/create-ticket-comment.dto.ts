import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthorType } from '@supportops/db';

export class CreateTicketCommentDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsEnum(AuthorType)
  authorType?: AuthorType;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
