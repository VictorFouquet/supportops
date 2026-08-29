import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api.js', () => ({ setStatus: vi.fn() }));
import { setStatus } from '@/lib/api.js';
import { PATCH } from './route.js';

const setStatusMock = vi.mocked(setStatus);
beforeEach(() => vi.clearAllMocks());

describe('PATCH /api/tickets/:id/status', () => {
  it('sets the status and returns the updated ticket', async () => {
    setStatusMock.mockResolvedValue({ id: 't1', status: 'RESOLVED' } as never);
    const req = new Request('http://localhost/api/tickets/t1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'RESOLVED' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 't1' }) });
    expect(res.status).toBe(200);
    expect(setStatusMock).toHaveBeenCalledWith('t1', 'RESOLVED');
  });
});
