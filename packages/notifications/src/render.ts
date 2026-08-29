import type { NotificationType } from '@supportops/db';
import type { NotificationMessage } from './transport.js';

/** The stored `payload` shape shared by every notification type. */
export interface NotificationPayload {
  ticketId: string;
  ticketSubject: string;
}

/** Build the message for a notification. Pure: no I/O, no side effects. */
export function renderMessage(input: {
  type: NotificationType;
  recipientEmail: string;
  payload: NotificationPayload;
}): NotificationMessage {
  const { type, recipientEmail, payload } = input;
  switch (type) {
    case 'TICKET_ASSIGNED':
      return {
        to: recipientEmail,
        subject: `Ticket assigned to you: ${payload.ticketSubject}`,
        body: `Ticket "${payload.ticketSubject}" has been assigned to you.`,
      };
    case 'TICKET_COMMENTED':
      return {
        to: recipientEmail,
        subject: `New comment on: ${payload.ticketSubject}`,
        body: `A new comment was added to ticket "${payload.ticketSubject}".`,
      };
  }
}
