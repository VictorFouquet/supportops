import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@supportops/db';
import { ROLES_KEY } from './decorators.js';
import type { AuthPrincipal } from './tokens.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ principal?: AuthPrincipal }>();
    const principal = request.principal;
    if (!principal || !required.includes(principal.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
