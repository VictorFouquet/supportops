import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { testPrisma, resetDb } from './client.js';

beforeEach(resetDb);
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('domain schema', () => {
  it('persists an org, agent, customer, and ticket with enum defaults', async () => {
    const org = await testPrisma.organization.create({
      data: { name: 'Acme Support', slug: 'acme', timezone: 'UTC' },
    });
    const agent = await testPrisma.user.create({
      data: {
        orgId: org.id,
        email: 'ada@acme.test',
        name: 'Ada Lovelace',
        role: 'AGENT',
        passwordHash: 'not-a-real-hash',
      },
    });
    const customer = await testPrisma.customer.create({
      data: { orgId: org.id, email: 'cara@customer.test', name: 'Cara' },
    });
    const ticket = await testPrisma.ticket.create({
      data: {
        orgId: org.id,
        customerId: customer.id,
        assigneeId: agent.id,
        subject: 'Cannot log in',
        description: 'The password reset link loops back to the login page.',
      },
    });

    expect(ticket.status).toBe('OPEN'); // enum default
    expect(ticket.priority).toBe('NORMAL'); // enum default
    expect(ticket.closedAt).toBeNull();
    expect(ticket.createdAt).toBeInstanceOf(Date);

    const found = await testPrisma.ticket.findFirstOrThrow({
      where: { orgId: org.id },
      include: { assignee: true, customer: true },
    });
    expect(found.assignee?.role).toBe('AGENT');
    expect(found.customer.email).toBe('cara@customer.test');
  });

  it('enforces one email per customer per organization', async () => {
    const org = await testPrisma.organization.create({
      data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
    });
    await testPrisma.customer.create({
      data: { orgId: org.id, email: 'dup@customer.test', name: 'First' },
    });
    await expect(
      testPrisma.customer.create({
        data: { orgId: org.id, email: 'dup@customer.test', name: 'Second' },
      }),
    ).rejects.toThrow();
  });
});
