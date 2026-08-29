import { prisma } from '@supportops/db';
import { renderMessage, type NotificationPayload } from './render.js';
import type { Transport } from './transport.js';

/**
 * Deliver one persisted notification: render it, send it through the transport,
 * and record the terminal status. A missing notification is a no-op. A transport
 * failure marks the row FAILED and rethrows so the queue records the job outcome.
 */
export async function deliverNotification(
  notificationId: string,
  transport: Transport,
): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { user: true },
  });
  if (!notification) return;

  const message = renderMessage({
    type: notification.type,
    recipientEmail: notification.user.email,
    payload: notification.payload as unknown as NotificationPayload,
  });

  try {
    await transport.send(message);
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  } catch (err) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'FAILED' },
    });
    throw err;
  }
}
