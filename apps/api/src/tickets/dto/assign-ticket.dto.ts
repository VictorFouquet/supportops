import { IsOptional, IsUUID } from 'class-validator';

/**
 * Assignment patch. `@IsOptional()` skips validation when a field is `null` or
 * absent, so a client may send `null` to unassign or omit a field to leave it
 * unchanged; a non-null value must be a UUID.
 */
export class AssignTicketDto {
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsUUID()
  teamId?: string | null;
}
