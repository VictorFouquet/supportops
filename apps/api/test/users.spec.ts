import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { hashPassword } from '@supportops/auth';
import { prisma, type Role } from '@supportops/db';
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

async function seedAndLogin(role: Role, slug = 'acme'): Promise<{ orgId: string; token: string }> {
  const org = await prisma.organization.upsert({
    where: { slug },
    update: {},
    create: { name: slug, slug, timezone: 'UTC' },
  });
  await prisma.user.create({
    data: {
      orgId: org.id,
      email: `${role}@${slug}.test`,
      name: role,
      role,
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ orgSlug: slug, email: `${role}@${slug}.test`, password: 's3cret-password' });
  return { orgId: org.id, token: res.body.accessToken as string };
}

describe('/users', () => {
  it('lets an owner create a user who can then log in', async () => {
    const { token } = await seedAndLogin('OWNER');
    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'new@acme.test', name: 'New', role: 'AGENT', password: 'initial-password' });
    expect(created.status).toBe(201);
    expect(created.body.passwordHash).toBeUndefined();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ orgSlug: 'acme', email: 'new@acme.test', password: 'initial-password' });
    expect(login.status).toBe(200);
  });

  it('forbids an agent from creating a user (403)', async () => {
    const { token } = await seedAndLogin('AGENT');
    const res = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'x@acme.test', name: 'X', role: 'AGENT', password: 'initial-password' });
    expect(res.status).toBe(403);
  });

  it('lets a user change their own password', async () => {
    const { token } = await seedAndLogin('AGENT');
    const res = await request(app.getHttpServer())
      .patch('/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 's3cret-password', newPassword: 'a-new-password' });
    expect(res.status).toBe(204);
    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ orgSlug: 'acme', email: 'AGENT@acme.test', password: 'a-new-password' });
    expect(relogin.status).toBe(200);
  });

  it('forbids an admin from granting the owner role (403)', async () => {
    const { token, orgId } = await seedAndLogin('ADMIN');
    const target = await prisma.user.create({
      data: {
        orgId,
        email: 'target@acme.test',
        name: 'Target',
        role: 'AGENT',
        passwordHash: await hashPassword('s3cret-password'),
      },
    });
    const res = await request(app.getHttpServer())
      .patch(`/users/${target.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'OWNER' });
    expect(res.status).toBe(403);
  });
});
