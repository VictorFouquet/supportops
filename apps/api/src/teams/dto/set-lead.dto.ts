import { IsUUID } from 'class-validator';

export class SetLeadDto {
  @IsUUID()
  leadUserId!: string;
}
