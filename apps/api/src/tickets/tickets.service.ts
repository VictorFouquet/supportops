import { Injectable } from '@nestjs/common';
import { prisma } from '@supportops/db';
import { NotFoundError } from '../common/domain-errors.js';
import { paginate, type Paginated } from '../common/pagination.js';
import { mapTicket, type TicketDto } from './dto/ticket.dto.js';
import type { CreateTicketDto } from './dto/create-ticket.dto.js';
import type { ListTicketsDto } from './dto/list-tickets.dto.js';

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
