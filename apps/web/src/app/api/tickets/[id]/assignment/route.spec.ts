import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api.js', () => ({ assignTicket: vi.fn() }));
import { assignTicket } from '@/lib/api.js';
import { PATCH } from './route.js';

const assignTicketMock = vi.mocked(assignTicket);
beforeEach(() => vi.clearAllMocks());

describe('PATCH /api/tickets/:id/assignment', () => {
  it('assigns the ticket and returns the updated ticket', async () => {
    assignTicketMock.mockResolvedValue({ id: 't1', assigneeId: 'u1' } as never);
    const req = new Request('http://localhost/api/tickets/t1/assignment', {
      method: 'PATCH',
      body: JSON.stringify({ assigneeId: 'u1' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 't1' }) });
    expect(res.status).toBe(200);
    expect(assignTicketMock).toHaveBeenCalledWith('t1', { assigneeId: 'u1' });
  });
});
