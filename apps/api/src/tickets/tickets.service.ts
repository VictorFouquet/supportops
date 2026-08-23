import { Injectable } from '@nestjs/common';
import { prisma, type TicketStatus } from '@supportops/db';
import { ConflictError, NotFoundError } from '../common/domain-errors.js';
import { paginate, type Paginated } from '../common/pagination.js';
import { mapTicket, type TicketDto } from './dto/ticket.dto.js';
import type { CreateTicketDto } from './dto/create-ticket.dto.js';
import type { UpdateTicketDto } from './dto/update-ticket.dto.js';
import type { AssignTicketDto } from './dto/assign-ticket.dto.js';
import type { ListTicketsDto } from './dto/list-tickets.dto.js';

/** The only legal status moves. A ticket may not jump along any other edge. */
const LEGAL_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['PENDING', 'RESOLVED'],
  PENDING: ['OPEN', 'RESOLVED'],
  RESOLVED: ['OPEN', 'CLOSED'],
  CLOSED: ['OPEN'],
};

@Injectable()
export class TicketsService {
  list(orgId: string, query: ListTicketsDto): Promise<Paginated<TicketDto>> {
    const where = {
      orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.q ? { subject: { contains: query.q, mode: 'insensitive' as const } } : {}),
    };
    return paginate(query, {
      count: () => prisma.ticket.count({ where }),
      findMany: async ({ skip, take }) =>
        (await prisma.ticket.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } })).map(
          (t) => mapTicket(t),
        ),
    });
  }

  async get(orgId: string, id: string): Promise<TicketDto> {
    return mapTicket(await this.getRow(orgId, id));
  }

  async create(orgId: string, dto: CreateTicketDto): Promise<TicketDto> {
    await this.assertCustomerInOrg(orgId, dto.customerId);
    if (dto.assigneeId) await this.assertUserInOrg(orgId, dto.assigneeId);
    if (dto.teamId) await this.assertTeamInOrg(orgId, dto.teamId);
    const ticket = await prisma.ticket.create({
      data: {
        orgId,
        customerId: dto.customerId,
        subject: dto.subject,
        description: dto.description,
        priority: dto.priority,
        assigneeId: dto.assigneeId ?? null,
        teamId: dto.teamId ?? null,
      },
    });
    return mapTicket(ticket);
  }

  async update(orgId: string, id: string, dto: UpdateTicketDto): Promise<TicketDto> {
    await this.getRow(orgId, id);
    const ticket = await prisma.ticket.update({
      where: { id },
      data: { subject: dto.subject, description: dto.description, priority: dto.priority },
    });
    return mapTicket(ticket);
  }

  async assign(orgId: string, id: string, dto: AssignTicketDto): Promise<TicketDto> {
    await this.getRow(orgId, id);
    const data: { assigneeId?: string | null; teamId?: string | null } = {};
    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId !== null) await this.assertUserInOrg(orgId, dto.assigneeId);
      data.assigneeId = dto.assigneeId;
    }
    if (dto.teamId !== undefined) {
      if (dto.teamId !== null) await this.assertTeamInOrg(orgId, dto.teamId);
      data.teamId = dto.teamId;
    }
    const ticket = await prisma.ticket.update({ where: { id }, data });
    return mapTicket(ticket);
  }

  async setStatus(orgId: string, id: string, to: TicketStatus): Promise<TicketDto> {
    const current = await this.getRow(orgId, id);
    if (!LEGAL_TRANSITIONS[current.status].includes(to)) {
      throw new ConflictError(`Cannot move a ticket from ${current.status} to ${to}`);
    }
    const data: { status: TicketStatus; closedAt?: Date | null } = { status: to };
    if (to === 'CLOSED') data.closedAt = new Date();
    else if (current.status === 'CLOSED') data.closedAt = null;
    const ticket = await prisma.ticket.update({ where: { id }, data });
    return mapTicket(ticket);
  }

  private async getRow(orgId: string, id: string) {
    const ticket = await prisma.ticket.findFirst({ where: { id, orgId } });
    if (!ticket) throw new NotFoundError('Ticket not found');
    return ticket;
  }

  private async assertCustomerInOrg(orgId: string, customerId: string): Promise<void> {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, orgId } });
    if (!customer) throw new NotFoundError('Customer not found');
  }

  private async assertUserInOrg(orgId: string, userId: string): Promise<void> {
    const user = await prisma.user.findFirst({ where: { id: userId, orgId } });
    if (!user) throw new NotFoundError('Assignee not found');
  }

  private async assertTeamInOrg(orgId: string, teamId: string): Promise<void> {
    const team = await prisma.team.findFirst({ where: { id: teamId, orgId } });
    if (!team) throw new NotFoundError('Team not found');
  }
}
