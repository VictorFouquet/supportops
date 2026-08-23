import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import { TicketsService } from './tickets.service.js';
import { NotFoundError } from '../common/domain-errors.js';

const service = new TicketsService();

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function seed() {
  const acme = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  const other = await prisma.organization.create({
    data: { name: 'Other', slug: 'other', timezone: 'UTC' },
  });
  const customer = await prisma.customer.create({
    data: { orgId: acme.id, email: 'c@acme.test', name: 'Cust' },
  });
  const agent = await prisma.user.create({
    data: { orgId: acme.id, email: 'a@acme.test', name: 'Agent', role: 'AGENT', passwordHash: 'x' },
  });
  const team = await prisma.team.create({
    data: { orgId: acme.id, name: 'Support', leadUserId: agent.id },
  });
  return { acme, other, customer, agent, team };
}

describe('TicketsService.create', () => {
  it('creates a ticket that defaults to OPEN/NORMAL with no closedAt', async () => {
    const { acme, customer } = await seed();
    const ticket = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'Cannot log in',
      description: 'Password reset loops',
    });
    expect(ticket).toMatchObject({
      customerId: customer.id,
      subject: 'Cannot log in',
      status: 'OPEN',
      priority: 'NORMAL',
      assigneeId: null,
      teamId: null,
      closedAt: null,
    });
  });

  it('accepts a same-organization assignee and team', async () => {
    const { acme, customer, agent, team } = await seed();
    const ticket = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'S',
      description: 'D',
      priority: 'HIGH',
      assigneeId: agent.id,
      teamId: team.id,
    });
    expect(ticket).toMatchObject({ assigneeId: agent.id, teamId: team.id, priority: 'HIGH' });
  });

  it('rejects a customer from another organization with 404', async () => {
    const { acme, other } = await seed();
    const foreign = await prisma.customer.create({
      data: { orgId: other.id, email: 'x@other.test', name: 'X' },
    });
    await expect(
      service.create(acme.id, { customerId: foreign.id, subject: 'S', description: 'D' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects an assignee from another organization with 404', async () => {
    const { acme, other, customer } = await seed();
    const foreignUser = await prisma.user.create({
      data: {
        orgId: other.id,
        email: 'u@other.test',
        name: 'U',
        role: 'AGENT',
        passwordHash: 'x',
      },
    });
    await expect(
      service.create(acme.id, {
        customerId: customer.id,
        subject: 'S',
        description: 'D',
        assigneeId: foreignUser.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('TicketsService.get / list', () => {
  it('does not read another organization ticket (404)', async () => {
    const { acme, other, customer } = await seed();
    const mine = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'S',
      description: 'D',
    });
    await expect(service.get(other.id, mine.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists tickets scoped to the organization in a page envelope', async () => {
    const { acme, other, customer } = await seed();
    await service.create(acme.id, { customerId: customer.id, subject: 'One', description: 'D' });
    await service.create(acme.id, { customerId: customer.id, subject: 'Two', description: 'D' });
    const foreignCustomer = await prisma.customer.create({
      data: { orgId: other.id, email: 'z@other.test', name: 'Z' },
    });
    await service.create(other.id, {
      customerId: foreignCustomer.id,
      subject: 'Nope',
      description: 'D',
    });

    const page = await service.list(acme.id, { page: 1, pageSize: 10 });
    expect(page).toMatchObject({ page: 1, pageSize: 10, total: 2 });
    expect(page.data.map((t) => t.subject).sort()).toEqual(['One', 'Two']);
  });

  it('filters by status, priority, and free text on subject', async () => {
    const { acme, customer } = await seed();
    const a = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'Billing question',
      description: 'D',
      priority: 'HIGH',
    });
    await service.create(acme.id, {
      customerId: customer.id,
      subject: 'Login issue',
      description: 'D',
      priority: 'LOW',
    });
    // Move the first ticket to PENDING so a status filter can distinguish them.
    await prisma.ticket.update({ where: { id: a.id }, data: { status: 'PENDING' } });

    expect((await service.list(acme.id, { page: 1, pageSize: 10, status: 'PENDING' })).total).toBe(
      1,
    );
    expect((await service.list(acme.id, { page: 1, pageSize: 10, priority: 'LOW' })).total).toBe(1);
    const byText = await service.list(acme.id, { page: 1, pageSize: 10, q: 'billing' });
    expect(byText.data).toHaveLength(1);
    expect(byText.data[0].subject).toBe('Billing question');
  });
});
