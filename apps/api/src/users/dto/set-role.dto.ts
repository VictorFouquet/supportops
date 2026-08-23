import { IsEnum } from 'class-validator';
import { Role } from '@supportops/db';

export class SetRoleDto {
  @IsEnum(Role)
  role!: Role;
}
