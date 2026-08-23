import { IsUUID, ValidateIf } from 'class-validator';

export class AssignTeamDto {
  @ValidateIf((o: AssignTeamDto) => o.teamId !== null)
  @IsUUID()
  teamId!: string | null;
}
