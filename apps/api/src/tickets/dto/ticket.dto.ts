import type { TicketPriority, TicketStatus } from '@supportops/db';

export interface TicketDto {
  id: string;
  customerId: string;
  assigneeId: string | null;
  teamId: string | null;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

/** Shared row → DTO mapper; the only place a ticket's public shape is defined. */
export function mapTicket(ticket: {
  id: string;
  customerId: string;
  assigneeId: string | null;
  teamId: string | null;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}): TicketDto {
  return {
    id: ticket.id,
    customerId: ticket.customerId,
    assigneeId: ticket.assigneeId,
    teamId: ticket.teamId,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    closedAt: ticket.closedAt,
  };
}
