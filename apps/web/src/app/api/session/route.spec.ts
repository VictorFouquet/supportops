import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api.js', () => ({ login: vi.fn() }));
vi.mock('@/lib/session.js', () => ({
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
}));
vi.mock('@/lib/http.js', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super('api');
      this.status = status;
    }
  },
}));

import { login } from '@/lib/api.js';
import { setSessionCookie, clearSessionCookie } from '@/lib/session.js';
import { ApiError } from '@/lib/http.js';
import { POST, DELETE } from './route.js';

const loginMock = vi.mocked(login);

beforeEach(() => vi.clearAllMocks());

function post(body: unknown) {
  return new Request('http://localhost/api/session', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/session', () => {
  it('sets the session cookie and returns 200 on valid credentials', async () => {
    loginMock.mockResolvedValue('jwt-123');
    const res = await POST(post({ orgSlug: 'acme', email: 'a@acme.test', password: 'pw' }));
    expect(res.status).toBe(200);
    expect(setSessionCookie).toHaveBeenCalledWith('jwt-123');
  });

  it('returns 401 and sets no cookie when the API rejects the login', async () => {
    loginMock.mockRejectedValue(new ApiError(401, undefined));
    const res = await POST(post({ orgSlug: 'acme', email: 'a@acme.test', password: 'nope' }));
    expect(res.status).toBe(401);
    expect(setSessionCookie).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/session', () => {
  it('clears the cookie', async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(clearSessionCookie).toHaveBeenCalled();
  });
});
