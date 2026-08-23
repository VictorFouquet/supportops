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

async function seedOrgWithAgent(slug: string): Promise<{
  orgId: string;
  token: string;
  customerId: string;
  agentId: string;
}> {
  const org = await prisma.organization.create({ data: { name: slug, slug, timezone: 'UTC' } });
  const agent = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `agent@${slug}.test`,
      name: 'Agent',
      role: 'AGENT',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const customer = await prisma.customer.create({
    data: { orgId: org.id, email: `cust@${slug}.test`, name: 'Cust' },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ orgSlug: slug, email: `agent@${slug}.test`, password: 's3cret-password' });
  return {
    orgId: org.id,
    token: res.body.accessToken as string,
    customerId: customer.id,
    agentId: agent.id,
  };
}

async function createTicket(token: string, customerId: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({ customerId, subject: 'Help', description: 'Please help' });
  return res.body.id as string;
}

describe('/tickets', () => {
  it('creates and lists tickets in a page envelope', async () => {
    const { token, customerId } = await seedOrgWithAgent('acme');
    await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, subject: 'Help', description: 'Please help' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/tickets')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(res.body.data[0]).toMatchObject({ subject: 'Help', status: 'OPEN', priority: 'NORMAL' });
  });

  it('requires authentication', async () => {
    const res = await request(app.getHttpServer()).get('/tickets');
    expect(res.status).toBe(401);
  });

  it('cannot read another organization ticket (404, not 403)', async () => {
    const acme = await seedOrgWithAgent('acme');
    const other = await seedOrgWithAgent('other');
    const id = await createTicket(acme.token, acme.customerId);
    const res = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(404);
  });

  it('assigns, then transitions status through resolve to close', async () => {
    const { token, customerId, agentId } = await seedOrgWithAgent('acme');
    const id = await createTicket(token, customerId);

    await request(app.getHttpServer())
      .patch(`/tickets/${id}/assignment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assigneeId: agentId })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/tickets/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'RESOLVED' })
      .expect(200);

    const closed = await request(app.getHttpServer())
      .patch(`/tickets/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CLOSED' });
    expect(closed.status).toBe(200);
    expect(closed.body.closedAt).not.toBeNull();
  });

  it('rejects an illegal status transition with 409', async () => {
    const { token, customerId } = await seedOrgWithAgent('acme');
    const id = await createTicket(token, customerId);
    const res = await request(app.getHttpServer())
      .patch(`/tickets/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CLOSED' }); // OPEN → CLOSED is not allowed
    expect(res.status).toBe(409);
  });

  it('filters the list by status', async () => {
    const { token, customerId } = await seedOrgWithAgent('acme');
    const id = await createTicket(token, customerId);
    await createTicket(token, customerId);
    await request(app.getHttpServer())
      .patch(`/tickets/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PENDING' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/tickets?status=PENDING')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].status).toBe('PENDING');
  });
});
