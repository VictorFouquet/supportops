import { notFound } from 'next/navigation';
import { getTicket, listComments, listCustomers, listUsers } from '@/lib/api.js';
import { ApiError } from '@/lib/http.js';
import { Badge } from '@/components/ui/badge.js';
import { CommentThread } from '@/components/tickets/comment-thread.js';
import { displayName, nameIndex } from '@/lib/lookups.js';

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let ticket;
  try {
    ticket = await getTicket(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const [comments, users, customers] = await Promise.all([
    listComments(id),
    listUsers(),
    listCustomers(),
  ]);
  const agents = nameIndex(users.data);
  const people = nameIndex(customers.data);

  return (
    <article className="space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2">
          <Badge tone="status" value={ticket.status} />
          <Badge tone="priority" value={ticket.priority} />
        </div>
        <h1 className="text-xl font-semibold">{ticket.subject}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Customer: {displayName(people, ticket.customerId)} · Assignee:{' '}
          {displayName(agents, ticket.assigneeId)}
        </p>
      </header>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <p className="whitespace-pre-wrap text-sm text-slate-800">{ticket.description}</p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Comments</h2>
        <CommentThread comments={comments.data} authorNames={agents} />
      </section>
    </article>
  );
}
