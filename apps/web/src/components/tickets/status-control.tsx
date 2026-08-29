'use client';

import { useRouter } from 'next/navigation';
import type { TicketStatus } from '@/lib/api-types.js';

const STATUSES: TicketStatus[] = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];

export function StatusControl({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const router = useRouter();
  async function change(next: string) {
    await fetch(`/api/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    router.refresh();
  }
  return (
    <label className="text-sm">
      <span className="mr-2 text-slate-600">Status</span>
      <select
        className="rounded border border-slate-300 px-2 py-1"
        defaultValue={status}
        onChange={(e) => change(e.target.value)}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.toLowerCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
