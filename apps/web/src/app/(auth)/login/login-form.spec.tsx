import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { LoginForm } from './login-form.js';

beforeEach(() => {
  push.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LoginForm', () => {
  it('posts credentials and navigates to /tickets on success', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/organization/i), 'acme');
    await userEvent.type(screen.getByLabelText(/email/i), 'a@acme.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(push).toHaveBeenCalledWith('/tickets');
  });

  it('shows an error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"Invalid"}', { status: 401 })),
    );
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/organization/i), 'acme');
    await userEvent.type(screen.getByLabelText(/email/i), 'a@acme.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'bad');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
