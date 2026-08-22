import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsUUID()
  leadUserId!: string;
}
