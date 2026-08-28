import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from '@supportops/db';
import type { NotificationJobData, NotificationProducer } from '@supportops/queue';
import { NotificationService } from './notification.service.js';
import { resetDb, seedOrgUser } from '../test/helpers.js';

class FakeProducer implements NotificationProducer {
  public readonly added: NotificationJobData[] = [];
  public shouldReject = false;
  async add(data: NotificationJobData): Promise<void> {
    this.added.push(data);
    if (this.shouldReject) throw new Error('redis down');
  }
  async close(): Promise<void> {}
}

const event = {
  ticketId: 't1',
  ticketSubject: 'Cannot log in',
};

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

describe('NotificationService', () => {
  it('records a PENDING assignment notification and enqueues it', async () => {
    const { org, user } = await seedOrgUser();
    const producer = new FakeProducer();

    await new NotificationService(producer).ticketAssigned({
      orgId: org.id,
      recipientUserId: user.id,
      ...event,
    });

    const rows = await prisma.notification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orgId: org.id,
      userId: user.id,
      type: 'TICKET_ASSIGNED',
      channel: 'EMAIL',
      status: 'PENDING',
    });
    expect(producer.added).toEqual([{ notificationId: rows[0]!.id }]);
  });

  it('still persists the row when the enqueue fails', async () => {
    const { org, user } = await seedOrgUser();
    const producer = new FakeProducer();
    producer.shouldReject = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      new NotificationService(producer).ticketCommented({
        orgId: org.id,
        recipientUserId: user.id,
        ...event,
      }),
    ).resolves.toBeUndefined();

    const rows = await prisma.notification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('TICKET_COMMENTED');
    vi.restoreAllMocks();
  });
});
