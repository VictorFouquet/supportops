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

async function seedAgent() {
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
}

describe('POST /auth/login', () => {
  it('returns an access token for valid credentials', async () => {
    await seedAgent();
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ orgSlug: 'acme', email: 'ada@acme.test', password: 's3cret-password' });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('returns 401 for a wrong password', async () => {
    await seedAgent();
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ orgSlug: 'acme', email: 'ada@acme.test', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.accessToken).toBeUndefined();
  });

  it('returns 401 for an unknown org or email (no enumeration)', async () => {
    await seedAgent();
    const unknownOrg = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ orgSlug: 'ghost', email: 'ada@acme.test', password: 's3cret-password' });
    const unknownEmail = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ orgSlug: 'acme', email: 'nobody@acme.test', password: 's3cret-password' });
    expect(unknownOrg.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ada@acme.test' });
    expect(res.status).toBe(400);
  });
});
