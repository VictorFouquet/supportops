import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hashPassword, verifyPassword, type AccessTokenClaims } from '@supportops/auth';
import { prisma } from '@supportops/db';
import { InvalidCredentialsError } from '../common/domain-errors.js';
import type { LoginResponseDto } from './dto/login-response.dto.js';

// A precomputed argon2id hash used when no user is found, so login does constant work
// and cannot be used to enumerate accounts by timing.
let dummyHashPromise: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('constant-time-placeholder');
  return dummyHashPromise;
}

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async login(orgSlug: string, email: string, password: string): Promise<LoginResponseDto> {
    const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
    const user = org
      ? await prisma.user.findUnique({ where: { orgId_email: { orgId: org.id, email } } })
      : null;

    const hash = user?.passwordHash ?? (await dummyHash());
    const ok = await verifyPassword(hash, password);
    if (!user || !ok) throw new InvalidCredentialsError();

    const claims: AccessTokenClaims = { sub: user.id, org: user.orgId, role: user.role };
    const accessToken = await this.jwt.signAsync(claims);
    return { accessToken };
  }
}
