import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TicketPriority } from '@supportops/db';

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
