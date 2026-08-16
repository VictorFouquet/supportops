import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { testPrisma, resetDb } from './client.js';
import { seed } from '../src/seed.js';

beforeEach(resetDb);
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('seed', () => {
  it('creates a lived-in organization', async () => {
    await seed(testPrisma);

    const org = await testPrisma.organization.findUniqueOrThrow({ where: { slug: 'acme' } });
    expect(await testPrisma.user.count({ where: { orgId: org.id } })).toBeGreaterThanOrEqual(3);
    expect(await testPrisma.ticket.count({ where: { orgId: org.id } })).toBeGreaterThanOrEqual(1);

    const ticket = await testPrisma.ticket.findFirstOrThrow({
      where: { orgId: org.id },
      include: { comments: true },
    });
    expect(ticket.comments.length).toBeGreaterThanOrEqual(2);
  });

  it('is idempotent', async () => {
    await seed(testPrisma);
    await seed(testPrisma);
    expect(await testPrisma.organization.count({ where: { slug: 'acme' } })).toBe(1);
  });
});
