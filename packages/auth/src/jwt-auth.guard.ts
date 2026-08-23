import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims, AuthPrincipal } from './tokens.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; principal?: AuthPrincipal }>();
    const match = request.headers['authorization']?.match(/^Bearer (.+)$/i);
    if (!match) {
      throw new UnauthorizedException('Missing bearer token');
    }
    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(match[1]!);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    if (
      typeof claims.sub !== 'string' ||
      typeof claims.org !== 'string' ||
      typeof claims.role !== 'string'
    ) {
      throw new UnauthorizedException('Invalid token');
    }
    request.principal = { userId: claims.sub, orgId: claims.org, role: claims.role };
    return true;
  }
}
