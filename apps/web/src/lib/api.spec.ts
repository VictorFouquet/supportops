import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./http.js', () => ({ request: vi.fn(), ApiError: class {} }));
vi.mock('./session.js', () => ({ getSessionToken: vi.fn() }));

import { request } from './http.js';
import { getSessionToken } from './session.js';
import { login, listTickets, addComment } from './api.js';

const requestMock = vi.mocked(request);
const tokenMock = vi.mocked(getSessionToken);

beforeEach(() => {
  vi.clearAllMocks();
  tokenMock.mockResolvedValue('sess-tok');
});

describe('api', () => {
  it('login posts credentials and returns the access token (no session token needed)', async () => {
    requestMock.mockResolvedValue({ accessToken: 'jwt-123' });
    const token = await login({ orgSlug: 'acme', email: 'a@acme.test', password: 'pw' });
    expect(token).toBe('jwt-123');
    expect(requestMock).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { orgSlug: 'acme', email: 'a@acme.test', password: 'pw' },
    });
  });

  it('listTickets forwards the session token and filters', async () => {
    requestMock.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });
    await listTickets({ status: 'OPEN', page: 2 });
    expect(requestMock).toHaveBeenCalledWith('/tickets', {
      token: 'sess-tok',
      searchParams: { status: 'OPEN', priority: undefined, assigneeId: undefined, page: '2' },
    });
  });

  it('addComment posts the body with the session token', async () => {
    requestMock.mockResolvedValue({ id: 'c1' });
    await addComment('t1', { body: 'hi', isInternal: true });
    expect(requestMock).toHaveBeenCalledWith('/tickets/t1/comments', {
      method: 'POST',
      token: 'sess-tok',
      body: { body: 'hi', isInternal: true },
    });
  });
});
