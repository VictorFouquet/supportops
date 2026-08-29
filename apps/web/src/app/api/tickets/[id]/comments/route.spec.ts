import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api.js', () => ({ addComment: vi.fn() }));
import { addComment } from '@/lib/api.js';
import { POST } from './route.js';

const addCommentMock = vi.mocked(addComment);
beforeEach(() => vi.clearAllMocks());

describe('POST /api/tickets/:id/comments', () => {
  it('adds the comment and returns it with status 201', async () => {
    addCommentMock.mockResolvedValue({ id: 'c1', body: 'On it' } as never);
    const req = new Request('http://localhost/api/tickets/t1/comments', {
      method: 'POST',
      body: JSON.stringify({ body: 'On it', isInternal: true }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: 't1' }) });
    expect(res.status).toBe(201);
    expect(addCommentMock).toHaveBeenCalledWith('t1', { body: 'On it', isInternal: true });
  });
});
