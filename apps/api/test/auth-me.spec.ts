import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { hashPassword } from '@supportops/auth';
import { prisma } from '@supportops/db';
import { buildTestApp } from './app.js';
import { resetDb } from './db.js';

let app: INestApplication;

beforeAll(async () => {
  ({ app } = await buildTestApp());
});
beforeEach(resetDb);
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function loginAsAgent(): Promise<string> {
  const org = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'ada@acme.test',
      name: 'Ada',
      role: 'AGENT',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ orgSlug: 'acme', email: 'ada@acme.test', password: 's3cret-password' });
  return res.body.accessToken as string;
}

describe('GET /auth/me', () => {
  it('returns the current user for a valid token and never leaks the password hash', async () => {
    const token = await loginAsAgent();
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('ada@acme.test');
    expect(res.body.role).toBe('AGENT');
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed token', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
