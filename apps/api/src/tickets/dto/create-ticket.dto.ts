import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { TicketPriority } from '@supportops/db';

export class CreateTicketDto {
  @IsUUID()
  customerId!: string;

  @IsString()
  @MinLength(1)
  subject!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}
