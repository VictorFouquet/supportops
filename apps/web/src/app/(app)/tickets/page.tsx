import Link from 'next/link';
import { listCustomers, listTickets, listUsers } from '@/lib/api.js';
import type { TicketPriority, TicketStatus } from '@/lib/api-types.js';
import { Badge } from '@/components/ui/badge.js';
import { TicketFilters } from '@/components/tickets/ticket-filters.js';
import { displayName, nameIndex } from '@/lib/lookups.js';

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const params = await searchParams;
  const status = params.status as TicketStatus | undefined;
  const priority = params.priority as TicketPriority | undefined;

  const [tickets, users, customers] = await Promise.all([
    listTickets({ status, priority }),
    listUsers(),
    listCustomers(),
  ]);
  const agents = nameIndex(users.data);
  const people = nameIndex(customers.data);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Tickets</h1>
      <TicketFilters current={{ status, priority }} />
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2">Subject</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Customer</th>
            <th>Assignee</th>
          </tr>
        </thead>
        <tbody>
          {tickets.data.map((ticket) => (
            <tr key={ticket.id} className="border-b border-slate-100 hover:bg-white">
              <td className="py-2">
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {ticket.subject}
                </Link>
              </td>
              <td>
                <Badge tone="status" value={ticket.status} />
              </td>
              <td>
                <Badge tone="priority" value={ticket.priority} />
              </td>
              <td>{displayName(people, ticket.customerId)}</td>
              <td>{displayName(agents, ticket.assigneeId)}</td>
            </tr>
          ))}
          {tickets.data.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-slate-500">
                No tickets match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
