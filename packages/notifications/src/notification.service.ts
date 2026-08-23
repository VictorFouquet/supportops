import { prisma, Prisma, type NotificationType } from '@supportops/db';
import type { NotificationProducer } from '@supportops/queue';
import type { NotificationPayload } from './render.js';

/** The context an emitted ticket notification needs. */
export interface TicketEvent {
  orgId: string;
  recipientUserId: string;
  ticketId: string;
  ticketSubject: string;
}

/**
 * Records a notification and enqueues its delivery. Persisting the row is the
 * durable outcome; the enqueue is best-effort — a queue outage is logged and
 * swallowed so the triggering product action never fails.
 */
export class NotificationService {
  constructor(private readonly producer: NotificationProducer) {}

  ticketAssigned(event: TicketEvent): Promise<void> {
    return this.emit('TICKET_ASSIGNED', event);
  }

  ticketCommented(event: TicketEvent): Promise<void> {
    return this.emit('TICKET_COMMENTED', event);
  }

  private async emit(type: NotificationType, event: TicketEvent): Promise<void> {
    const payload: NotificationPayload = {
      ticketId: event.ticketId,
      ticketSubject: event.ticketSubject,
    };
    const notification = await prisma.notification.create({
      data: {
        orgId: event.orgId,
        userId: event.recipientUserId,
        type,
        channel: 'EMAIL',
        payload: payload as unknown as Prisma.InputJsonObject,
        status: 'PENDING',
      },
    });
    void this.producer
      .add({ notificationId: notification.id })
      .catch((err: unknown) =>
        console.error(`[notifications] failed to enqueue ${notification.id}:`, err),
      );
  }
}
