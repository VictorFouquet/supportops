'use client';

import { useRouter } from 'next/navigation';
import type { User } from '@/lib/api-types.js';

export function AssignControl({
  ticketId,
  assigneeId,
  agents,
}: {
  ticketId: string;
  assigneeId: string | null;
  agents: User[];
}) {
  const router = useRouter();
  async function change(value: string) {
    await fetch(`/api/tickets/${ticketId}/assignment`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assigneeId: value === '' ? null : value }),
    });
    router.refresh();
  }
  return (
    <label className="text-sm">
      <span className="mr-2 text-slate-600">Assignee</span>
      <select
        className="rounded border border-slate-300 px-2 py-1"
        defaultValue={assigneeId ?? ''}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">Unassigned</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
    </label>
  );
}
