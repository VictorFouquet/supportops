import type { AuthorType } from '@supportops/db';

export interface TicketCommentDto {
  id: string;
  ticketId: string;
  authorType: AuthorType;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: Date;
}

export function mapComment(comment: {
  id: string;
  ticketId: string;
  authorType: AuthorType;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: Date;
}): TicketCommentDto {
  return {
    id: comment.id,
    ticketId: comment.ticketId,
    authorType: comment.authorType,
    authorId: comment.authorId,
    body: comment.body,
    isInternal: comment.isInternal,
    createdAt: comment.createdAt,
  };
}
