import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TicketPriority, TicketStatus } from '@supportops/db';
import { PageQueryDto } from '../../common/pagination.js';

export class ListTicketsDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

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
