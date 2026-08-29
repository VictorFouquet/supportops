import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { AppHeader } from './app-header.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  push.mockClear();
});

const me = {
  id: 'u1',
  email: 'a@acme.test',
  name: 'Ada Agent',
  role: 'AGENT' as const,
  orgId: 'o1',
  teamId: null,
};

describe('AppHeader', () => {
  it('shows the current user and a tickets link', () => {
    render(<AppHeader user={me} />);
    expect(screen.getByText('Ada Agent')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tickets/i })).toHaveAttribute('href', '/tickets');
  });

  it('logs out via DELETE /api/session and returns to /login', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AppHeader user={me} />);
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(push).toHaveBeenCalledWith('/login');
  });
});
