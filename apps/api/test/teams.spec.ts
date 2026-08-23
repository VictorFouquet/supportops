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

async function seedOwner(): Promise<{ orgId: string; token: string }> {
  const org = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'owner@acme.test',
      name: 'Owner',
      role: 'OWNER',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ orgSlug: 'acme', email: 'owner@acme.test', password: 's3cret-password' });
  return { orgId: org.id, token: res.body.accessToken as string };
}

describe('/teams', () => {
  it('creates and lists teams in a page envelope', async () => {
    const { orgId, token } = await seedOwner();
    const lead = await prisma.user.create({
      data: {
        orgId,
        email: 'lead@acme.test',
        name: 'Lead',
        role: 'TEAM_LEAD',
        passwordHash: await hashPassword('s3cret-password'),
      },
    });
    const created = await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Support', leadUserId: lead.id });
    expect(created.status).toBe(201);

    const res = await request(app.getHttpServer())
      .get('/teams')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(res.body.data[0].name).toBe('Support');
  });

  it('rejects a duplicate team name with 409', async () => {
    const { orgId, token } = await seedOwner();
    const lead = await prisma.user.create({
      data: {
        orgId,
        email: 'lead@acme.test',
        name: 'Lead',
        role: 'TEAM_LEAD',
        passwordHash: await hashPassword('s3cret-password'),
      },
    });
    await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Support', leadUserId: lead.id })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Support', leadUserId: lead.id });
    expect(res.status).toBe(409);
  });

  it('confines a team lead to their own team over HTTP', async () => {
    const { orgId } = await seedOwner();
    const _lead = await prisma.user.create({
      data: {
        orgId,
        email: 'lead@acme.test',
        name: 'Lead',
        role: 'TEAM_LEAD',
        passwordHash: await hashPassword('s3cret-password'),
      },
    });
    const otherLead = await prisma.user.create({
      data: {
        orgId,
        email: 'other-lead@acme.test',
        name: 'Other',
        role: 'TEAM_LEAD',
        passwordHash: await hashPassword('s3cret-password'),
      },
    });
    const theirs = await prisma.team.create({
      data: { orgId, name: 'Theirs', leadUserId: otherLead.id },
    });
    const member = await prisma.user.create({
      data: {
        orgId,
        email: 'm@acme.test',
        name: 'M',
        role: 'AGENT',
        passwordHash: await hashPassword('s3cret-password'),
      },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ orgSlug: 'acme', email: 'lead@acme.test', password: 's3cret-password' });
    const res = await request(app.getHttpServer())
      .patch(`/teams/${theirs.id}/members`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ add: [member.id] });
    expect(res.status).toBe(403);
  });
});
