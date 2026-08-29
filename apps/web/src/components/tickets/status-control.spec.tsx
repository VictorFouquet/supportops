import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { StatusControl } from './status-control.js';

beforeEach(() => refresh.mockClear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('StatusControl', () => {
  it('patches the chosen status and refreshes', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<StatusControl ticketId="t1" status="OPEN" />);
    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'RESOLVED');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tickets/t1/status',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(refresh).toHaveBeenCalled();
  });
});
