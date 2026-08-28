import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '@supportops/db';
import { deliverNotification } from './deliver.js';
import type { NotificationMessage, Transport } from './transport.js';
import { resetDb, seedOrgUser } from '../test/helpers.js';

class FakeTransport implements Transport {
  public readonly sent: NotificationMessage[] = [];
  public shouldThrow = false;
  async send(message: NotificationMessage): Promise<void> {
    if (this.shouldThrow) throw new Error('smtp down');
    this.sent.push(message);
  }
}

async function seedNotification() {
  const { org, user } = await seedOrgUser();
  const notification = await prisma.notification.create({
    data: {
      orgId: org.id,
      userId: user.id,
      type: 'TICKET_ASSIGNED',
      channel: 'EMAIL',
      payload: { ticketId: 't1', ticketSubject: 'Cannot log in' },
      status: 'PENDING',
    },
  });
  return { user, notification };
}

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

describe('deliverNotification', () => {
  it('sends the rendered message and marks the row SENT', async () => {
    const { user, notification } = await seedNotification();
    const transport = new FakeTransport();

    await deliverNotification(notification.id, transport);

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.to).toBe(user.email);
    const row = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(row.status).toBe('SENT');
    expect(row.sentAt).toBeInstanceOf(Date);
  });

  it('marks the row FAILED and rethrows when the transport throws', async () => {
    const { notification } = await seedNotification();
    const transport = new FakeTransport();
    transport.shouldThrow = true;

    await expect(deliverNotification(notification.id, transport)).rejects.toThrow('smtp down');

    const row = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(row.status).toBe('FAILED');
    expect(row.sentAt).toBeNull();
  });

  it('is a no-op for a missing notification', async () => {
    await resetDb();
    const transport = new FakeTransport();
    await expect(
      deliverNotification('00000000-0000-0000-0000-000000000000', transport),
    ).resolves.toBeUndefined();
    expect(transport.sent).toHaveLength(0);
  });
});
