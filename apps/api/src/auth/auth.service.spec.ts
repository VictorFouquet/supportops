import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { hashPassword, type AccessTokenClaims } from '@supportops/auth';
import { prisma } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import { AuthService } from './auth.service.js';
import { InvalidCredentialsError } from '../common/domain-errors.js';

const jwt = new JwtService({
  secret: 'test-secret-at-least-16-chars',
  signOptions: { expiresIn: '1h' },
});
const service = new AuthService(jwt);

async function seedUser() {
  const org = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'ada@acme.test',
      name: 'Ada',
      role: 'AGENT',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  return { org, user };
}

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

describe('AuthService.login', () => {
  it('issues a token with the user, org, and role for valid credentials', async () => {
    const { org, user } = await seedUser();
    const { accessToken } = await service.login('acme', 'ada@acme.test', 's3cret-password');
    const claims = await jwt.verifyAsync<AccessTokenClaims>(accessToken);
    expect(claims.sub).toBe(user.id);
    expect(claims.org).toBe(org.id);
    expect(claims.role).toBe('AGENT');
  });

  it('rejects a wrong password', async () => {
    await seedUser();
    await expect(service.login('acme', 'ada@acme.test', 'wrong')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('rejects an unknown email without revealing it', async () => {
    await seedUser();
    await expect(
      service.login('acme', 'nobody@acme.test', 's3cret-password'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('rejects an unknown organization', async () => {
    await seedUser();
    await expect(service.login('ghost', 'ada@acme.test', 's3cret-password')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });
});
