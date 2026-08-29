import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import type { NotificationService } from '@supportops/notifications';
import { TicketCommentsService } from './ticket-comments.service.js';
import { NotFoundError } from '../common/domain-errors.js';

// Notification emission is covered elsewhere; a no-op stand-in keeps this unit focused.
const notifications = {
  ticketAssigned: async () => {},
  ticketCommented: async () => {},
} as unknown as NotificationService;
const service = new TicketCommentsService(notifications);

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedTicket() {
  const org = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  const other = await prisma.organization.create({
    data: { name: 'Other', slug: 'other', timezone: 'UTC' },
  });
  const agent = await prisma.user.create({
    data: { orgId: org.id, email: 'a@acme.test', name: 'A', role: 'AGENT', passwordHash: 'x' },
  });
  const customer = await prisma.customer.create({
    data: { orgId: org.id, email: 'c@acme.test', name: 'C' },
  });
  const ticket = await prisma.ticket.create({
    data: { orgId: org.id, customerId: customer.id, subject: 'S', description: 'D' },
  });
  return { org, other, agent, customer, ticket };
}

describe('TicketCommentsService.create', () => {
  it('defaults to an agent-authored, public comment attributed to the caller', async () => {
    const { org, agent, ticket } = await seedTicket();
    const comment = await service.create(org.id, ticket.id, agent.id, { body: 'On it' });
    expect(comment).toMatchObject({
      ticketId: ticket.id,
      authorType: 'AGENT',
      authorId: agent.id,
      body: 'On it',
      isInternal: false,
    });
  });

  it('records a customer-authored comment against the ticket customer', async () => {
    const { org, agent, customer, ticket } = await seedTicket();
    const comment = await service.create(org.id, ticket.id, agent.id, {
      body: 'Customer called to say thanks',
      authorType: 'CUSTOMER',
    });
    expect(comment).toMatchObject({ authorType: 'CUSTOMER', authorId: customer.id });
  });

  it('honours the internal flag', async () => {
    const { org, agent, ticket } = await seedTicket();
    const comment = await service.create(org.id, ticket.id, agent.id, {
      body: 'Private note',
      isInternal: true,
    });
    expect(comment.isInternal).toBe(true);
  });

  it('does not comment on a ticket in another organization (404)', async () => {
    const { other, agent, ticket } = await seedTicket();
    await expect(
      service.create(other.id, ticket.id, agent.id, { body: 'nope' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('TicketCommentsService.list', () => {
  it('lists a ticket comments oldest-first in a page envelope', async () => {
    const { org, agent, ticket } = await seedTicket();
    await service.create(org.id, ticket.id, agent.id, { body: 'first' });
    await service.create(org.id, ticket.id, agent.id, { body: 'second' });
    const page = await service.list(org.id, ticket.id, { page: 1, pageSize: 10 });
    expect(page).toMatchObject({ page: 1, pageSize: 10, total: 2 });
    expect(page.data.map((c) => c.body)).toEqual(['first', 'second']);
  });

  it('does not list comments of a ticket in another organization (404)', async () => {
    const { other, ticket } = await seedTicket();
    await expect(
      service.list(other.id, ticket.id, { page: 1, pageSize: 10 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
