import type { Role } from '@supportops/db';

/** Claims carried inside a signed access token. */
export interface AccessTokenClaims {
  sub: string; // user id
  org: string; // organization id
  role: Role;
}

/** The authenticated principal attached to a request by JwtAuthGuard. */
export interface AuthPrincipal {
  userId: string;
  orgId: string;
  role: Role;
}
