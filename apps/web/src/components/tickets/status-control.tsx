'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketStatus } from '@/lib/api-types.js';
import { mutate } from '@/lib/mutate.js';

const STATUSES: TicketStatus[] = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];

export function StatusControl({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function change(next: string) {
    setError(null);
    const result = await mutate(`/api/tickets/${ticketId}/status`, 'PATCH', { status: next });
    if (!result.ok) {
      setError('Could not update status');
      return;
    }
    router.refresh();
  }
  return (
    <div>
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
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
