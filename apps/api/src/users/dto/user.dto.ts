import type { Role } from '@supportops/db';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId: string | null;
}

/** Shared mapper so other modules (e.g. teams membership) return the same shape. */
export function mapUser(user: {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId: string | null;
}): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    teamId: user.teamId,
  };
}
