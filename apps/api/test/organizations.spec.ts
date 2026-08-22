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

async function seedAndLogin(role: 'OWNER' | 'AGENT'): Promise<string> {
  const org = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  await prisma.user.create({
    data: {
      orgId: org.id,
      email: `${role}@acme.test`,
      name: role,
      role,
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ orgSlug: 'acme', email: `${role}@acme.test`, password: 's3cret-password' });
  return res.body.accessToken as string;
}

describe('/orgs/me', () => {
  it('returns the caller organization for any authenticated role', async () => {
    const token = await seedAndLogin('AGENT');
    const res = await request(app.getHttpServer())
      .get('/orgs/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('acme');
  });

  it('lets an owner update name and timezone', async () => {
    const token = await seedAndLogin('OWNER');
    const res = await request(app.getHttpServer())
      .patch('/orgs/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Inc' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Acme Inc');
  });

  it('forbids an agent from updating the organization', async () => {
    const token = await seedAndLogin('AGENT');
    const res = await request(app.getHttpServer())
      .patch('/orgs/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('rejects an attempt to change the slug', async () => {
    const token = await seedAndLogin('OWNER');
    const res = await request(app.getHttpServer())
      .patch('/orgs/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'hacked' });
    expect(res.status).toBe(400);
  });
});
