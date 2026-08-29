import 'server-only';
import { request } from './http.js';
import { getSessionToken } from './session.js';
import type {
  Customer,
  Me,
  Paginated,
  Ticket,
  TicketComment,
  TicketPriority,
  TicketStatus,
  User,
} from './api-types.js';

async function token(): Promise<string | undefined> {
  return getSessionToken();
}

export async function login(creds: {
  orgSlug: string;
  email: string;
  password: string;
}): Promise<string> {
  const { accessToken } = await request<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: creds,
  });
  return accessToken;
}

export async function getMe(): Promise<Me> {
  return request<Me>('/auth/me', { token: await token() });
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  page?: number;
}

export async function listTickets(filters: TicketFilters = {}): Promise<Paginated<Ticket>> {
  return request<Paginated<Ticket>>('/tickets', {
    token: await token(),
    searchParams: {
      status: filters.status,
      priority: filters.priority,
      assigneeId: filters.assigneeId,
      page: filters.page ? String(filters.page) : undefined,
    },
  });
}

export async function getTicket(id: string): Promise<Ticket> {
  return request<Ticket>(`/tickets/${id}`, { token: await token() });
}

export async function listComments(ticketId: string): Promise<Paginated<TicketComment>> {
  return request<Paginated<TicketComment>>(`/tickets/${ticketId}/comments`, {
    token: await token(),
    searchParams: { pageSize: '100' },
  });
}

export async function addComment(
  ticketId: string,
  input: { body: string; isInternal?: boolean; authorType?: 'AGENT' | 'CUSTOMER' },
): Promise<TicketComment> {
  return request<TicketComment>(`/tickets/${ticketId}/comments`, {
    method: 'POST',
    token: await token(),
    body: input,
  });
}

export async function setStatus(ticketId: string, status: TicketStatus): Promise<Ticket> {
  return request<Ticket>(`/tickets/${ticketId}/status`, {
    method: 'PATCH',
    token: await token(),
    body: { status },
  });
}

export async function assignTicket(
  ticketId: string,
  patch: { assigneeId?: string | null; teamId?: string | null },
): Promise<Ticket> {
  return request<Ticket>(`/tickets/${ticketId}/assignment`, {
    method: 'PATCH',
    token: await token(),
    body: patch,
  });
}

export async function listUsers(): Promise<Paginated<User>> {
  return request<Paginated<User>>('/users', {
    token: await token(),
    searchParams: { pageSize: '100' },
  });
}

export async function listCustomers(): Promise<Paginated<Customer>> {
  return request<Paginated<Customer>>('/customers', {
    token: await token(),
    searchParams: { pageSize: '100' },
  });
}
