import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '@/lib/api-types.js';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { AssignControl } from './assign-control.js';

const agents: User[] = [
  { id: 'u1', email: 'a@acme.test', name: 'Ada Agent', role: 'AGENT', teamId: null },
];

beforeEach(() => refresh.mockClear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AssignControl', () => {
  it('patches the chosen assignee and refreshes', async () => {
    const fetchMock = vi.fn(
      async (..._args: Parameters<typeof fetch>) => new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<AssignControl ticketId="t1" assigneeId={null} agents={agents} />);
    await userEvent.selectOptions(screen.getByLabelText(/assignee/i), 'Ada Agent');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ assigneeId: 'u1' });
    expect(refresh).toHaveBeenCalled();
  });

  it('maps the empty selection to a null assigneeId', async () => {
    const fetchMock = vi.fn(
      async (..._args: Parameters<typeof fetch>) => new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<AssignControl ticketId="t1" assigneeId="u1" agents={agents} />);
    await userEvent.selectOptions(screen.getByLabelText(/assignee/i), 'Unassigned');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ assigneeId: null });
    expect(refresh).toHaveBeenCalled();
  });

  it('shows an error and does not refresh when the update fails', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"forbidden"}', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AssignControl ticketId="t1" assigneeId={null} agents={agents} />);
    await userEvent.selectOptions(screen.getByLabelText(/assignee/i), 'Ada Agent');
    expect(await screen.findByText(/could not update assignee/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
