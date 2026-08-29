import { describe, it, expect, vi, beforeEach } from 'vitest';

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock('next/navigation', () => ({ redirect }));

const { ApiError } = vi.hoisted(() => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super('api error');
      this.status = status;
    }
  },
}));
vi.mock('@/lib/http.js', () => ({ ApiError }));

vi.mock('@/lib/api.js', () => ({ getMe: vi.fn() }));
import { getMe } from '@/lib/api.js';
import AppLayout from './layout.js';

const getMeMock = vi.mocked(getMe);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AppLayout', () => {
  it('redirects to the session-expiry route when the API rejects with a 401', async () => {
    getMeMock.mockRejectedValue(new ApiError(401));
    await expect(AppLayout({ children: null })).rejects.toThrow(
      'NEXT_REDIRECT:/api/session/expire',
    );
    expect(redirect).toHaveBeenCalledWith('/api/session/expire');
  });

  it('rethrows non-401 errors without redirecting', async () => {
    getMeMock.mockRejectedValue(new ApiError(500));
    await expect(AppLayout({ children: null })).rejects.toThrow('api error');
    expect(redirect).not.toHaveBeenCalled();
  });
});
