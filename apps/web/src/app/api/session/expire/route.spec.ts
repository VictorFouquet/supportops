import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/session.js', () => ({ clearSessionCookie: vi.fn() }));
import { clearSessionCookie } from '@/lib/session.js';
import { GET } from './route.js';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/session/expire', () => {
  it('clears the session cookie and redirects to /login', async () => {
    const req = new Request('http://localhost/api/session/expire');
    const res = await GET(req);
    expect(clearSessionCookie).toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/login');
  });
});
