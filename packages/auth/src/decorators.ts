import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@supportops/db';
import type { AuthPrincipal } from './tokens.js';

export const ROLES_KEY = 'roles';

/** Restrict a route to the given roles; enforced by RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Inject the authenticated principal into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal =>
    ctx.switchToHttp().getRequest<{ principal: AuthPrincipal }>().principal,
);

/** Inject the authenticated principal's organization id. */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<{ principal: AuthPrincipal }>().principal.orgId,
);
