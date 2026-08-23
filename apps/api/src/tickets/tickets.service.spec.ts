import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import type { NotificationService } from '@supportops/notifications';
import { TicketsService } from './tickets.service.js';
import { ConflictError, NotFoundError } from '../common/domain-errors.js';

// This unit suite exercises ticket rules; notification emission is covered by the
// notifications package and the API integration suite, so a no-op stand-in suffices.
const notifications = {
  ticketAssigned: async () => {},
  ticketCommented: async () => {},
} as unknown as NotificationService;
const service = new TicketsService(notifications);

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

describe('TicketsService.update / assign', () => {
  it('updates subject, description, and priority', async () => {
    const { acme, customer } = await seed();
    const t = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'Old',
      description: 'Old body',
    });
    const updated = await service.update(acme.id, t.id, {
      subject: 'New',
      priority: 'CRITICAL',
    });
    expect(updated).toMatchObject({
      subject: 'New',
      description: 'Old body',
      priority: 'CRITICAL',
    });
  });

  it('assigns and then unassigns via null', async () => {
    const { acme, customer, agent, team } = await seed();
    const t = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'S',
      description: 'D',
    });
    const assigned = await service.assign(acme.id, t.id, {
      assigneeId: agent.id,
      teamId: team.id,
    });
    expect(assigned).toMatchObject({ assigneeId: agent.id, teamId: team.id });

    const cleared = await service.assign(acme.id, t.id, { assigneeId: null });
    expect(cleared).toMatchObject({ assigneeId: null, teamId: team.id });
  });

  it('rejects assigning a user from another organization (404)', async () => {
    const { acme, other, customer } = await seed();
    const t = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'S',
      description: 'D',
    });
    const foreign = await prisma.user.create({
      data: {
        orgId: other.id,
        email: 'f@other.test',
        name: 'F',
        role: 'AGENT',
        passwordHash: 'x',
      },
    });
    await expect(service.assign(acme.id, t.id, { assigneeId: foreign.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('TicketsService.setStatus', () => {
  async function openTicket() {
    const { acme, customer } = await seed();
    const t = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'S',
      description: 'D',
    });
    return { acme, id: t.id };
  }

  it('walks OPEN → RESOLVED → CLOSED, setting closedAt on close', async () => {
    const { acme, id } = await openTicket();
    await service.setStatus(acme.id, id, 'RESOLVED');
    const closed = await service.setStatus(acme.id, id, 'CLOSED');
    expect(closed.status).toBe('CLOSED');
    expect(closed.closedAt).toBeInstanceOf(Date);
  });

  it('clears closedAt when a closed ticket is reopened', async () => {
    const { acme, id } = await openTicket();
    await service.setStatus(acme.id, id, 'RESOLVED');
    await service.setStatus(acme.id, id, 'CLOSED');
    const reopened = await service.setStatus(acme.id, id, 'OPEN');
    expect(reopened.status).toBe('OPEN');
    expect(reopened.closedAt).toBeNull();
  });

  it('rejects an illegal transition with ConflictError', async () => {
    const { acme, id } = await openTicket(); // status OPEN
    await expect(service.setStatus(acme.id, id, 'CLOSED')).rejects.toBeInstanceOf(ConflictError);
  });

  it('does not transition another organization ticket (404)', async () => {
    const { id } = await openTicket();
    const other = await prisma.organization.create({
      data: { name: 'Z', slug: 'z-org', timezone: 'UTC' },
    });
    await expect(service.setStatus(other.id, id, 'PENDING')).rejects.toBeInstanceOf(NotFoundError);
  });
});
