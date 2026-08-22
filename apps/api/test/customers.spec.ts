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

async function seedOrgWithAgent(slug: string): Promise<{ orgId: string; token: string }> {
  const org = await prisma.organization.create({
    data: { name: slug, slug, timezone: 'UTC' },
  });
  await prisma.user.create({
    data: {
      orgId: org.id,
      email: `agent@${slug}.test`,
      name: 'Agent',
      role: 'AGENT',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ orgSlug: slug, email: `agent@${slug}.test`, password: 's3cret-password' });
  return { orgId: org.id, token: res.body.accessToken as string };
}

describe('/customers', () => {
  it('creates and lists customers in a page envelope', async () => {
    const { token } = await seedOrgWithAgent('acme');
    await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'c1@x.test', name: 'C1' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(res.body.data[0].email).toBe('c1@x.test');
  });

  it('requires authentication', async () => {
    const res = await request(app.getHttpServer()).get('/customers');
    expect(res.status).toBe(401);
  });

  it('cannot read another organization customer (404, not 403)', async () => {
    const acme = await seedOrgWithAgent('acme');
    const other = await seedOrgWithAgent('other');
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${acme.token}`)
      .send({ email: 'mine@x.test', name: 'Mine' });
    const res = await request(app.getHttpServer())
      .get(`/customers/${created.body.id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(404);
  });

  it('rejects a duplicate email with 409', async () => {
    const { token } = await seedOrgWithAgent('acme');
    await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'dup@x.test', name: 'One' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'dup@x.test', name: 'Two' });
    expect(res.status).toBe(409);
  });
});
