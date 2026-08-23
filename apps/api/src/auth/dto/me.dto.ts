import type { Role } from '@supportops/db';

export interface MeDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgId: string;
  teamId: string | null;
}
