import { IsEnum } from 'class-validator';
import { TicketStatus } from '@supportops/db';

export class UpdateTicketStatusDto {
  @IsEnum(TicketStatus)
  status!: TicketStatus;
}
