import { Injectable } from '@nestjs/common';
import { prisma, type AuthorType } from '@supportops/db';
import { NotificationService } from '@supportops/notifications';
import { NotFoundError } from '../common/domain-errors.js';
import { paginate, type Paginated, type PageQueryDto } from '../common/pagination.js';
import { mapComment, type TicketCommentDto } from './dto/ticket-comment.dto.js';
import type { CreateTicketCommentDto } from './dto/create-ticket-comment.dto.js';

@Injectable()
export class TicketCommentsService {
  constructor(private readonly notifications: NotificationService) {}

  async list(
    orgId: string,
    ticketId: string,
    query: PageQueryDto,
  ): Promise<Paginated<TicketCommentDto>> {
    await this.assertTicketInOrg(orgId, ticketId);
    const where = { ticketId };
    return paginate(query, {
      count: () => prisma.ticketComment.count({ where }),
      findMany: async ({ skip, take }) =>
        (
          await prisma.ticketComment.findMany({ where, skip, take, orderBy: { createdAt: 'asc' } })
        ).map((c) => mapComment(c)),
    });
  }

  async create(
    orgId: string,
    ticketId: string,
    actorUserId: string,
    dto: CreateTicketCommentDto,
  ): Promise<TicketCommentDto> {
    const ticket = await this.assertTicketInOrg(orgId, ticketId);
    const authorType: AuthorType = dto.authorType ?? 'AGENT';
    const authorId = authorType === 'CUSTOMER' ? ticket.customerId : actorUserId;
    const comment = await prisma.ticketComment.create({
      data: { ticketId, authorType, authorId, body: dto.body, isInternal: dto.isInternal ?? false },
    });
    // Notify the assignee of new activity, unless they are the one who added it.
    if (ticket.assigneeId && ticket.assigneeId !== actorUserId) {
      await this.notifications.ticketCommented({
        orgId,
        recipientUserId: ticket.assigneeId,
        ticketId: ticket.id,
        ticketSubject: ticket.subject,
      });
    }
    return mapComment(comment);
  }

  private async assertTicketInOrg(orgId: string, ticketId: string) {
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, orgId } });
    if (!ticket) throw new NotFoundError('Ticket not found');
    return ticket;
  }
}
