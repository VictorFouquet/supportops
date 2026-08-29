'use client';

import { useRouter } from 'next/navigation';
import type { TicketPriority, TicketStatus } from '@/lib/api-types.js';

const STATUSES: TicketStatus[] = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITIES: TicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

export function TicketFilters({
  current,
}: {
  current: { status?: TicketStatus; priority?: TicketPriority };
}) {
  const router = useRouter();

  function apply(next: { status?: string; priority?: string }) {
    const params = new URLSearchParams();
    const status = next.status ?? current.status;
    const priority = next.priority ?? current.priority;
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    const qs = params.toString();
    router.push(qs ? `/tickets?${qs}` : '/tickets');
  }

  return (
    <div className="mb-4 flex gap-4">
      <label className="text-sm">
        <span className="mr-2 text-slate-600">Status</span>
        <select
          className="rounded border border-slate-300 px-2 py-1"
          defaultValue={current.status ?? ''}
          onChange={(e) => apply({ status: e.target.value })}
        >
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mr-2 text-slate-600">Priority</span>
        <select
          className="rounded border border-slate-300 px-2 py-1"
          defaultValue={current.priority ?? ''}
          onChange={(e) => apply({ priority: e.target.value })}
        >
          <option value="">All</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p.toLowerCase()}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
