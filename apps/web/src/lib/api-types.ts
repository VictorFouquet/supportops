export type Role = 'OWNER' | 'ADMIN' | 'TEAM_LEAD' | 'AGENT';
export type TicketStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type AuthorType = 'AGENT' | 'CUSTOMER';

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgId: string;
  teamId: string | null;
}

export interface Ticket {
  id: string;
  customerId: string;
  assigneeId: string | null;
  teamId: string | null;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorType: AuthorType;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId: string | null;
}

export interface Customer {
  id: string;
  email: string;
  name: string;
}
