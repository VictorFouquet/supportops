'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/api-types.js';
import { mutate } from '@/lib/mutate.js';

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
  const [error, setError] = useState<string | null>(null);
  async function change(value: string) {
    setError(null);
    const result = await mutate(`/api/tickets/${ticketId}/assignment`, 'PATCH', {
      assigneeId: value === '' ? null : value,
    });
    if (!result.ok) {
      setError('Could not update assignee');
      return;
    }
    router.refresh();
  }
  return (
    <div>
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
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
