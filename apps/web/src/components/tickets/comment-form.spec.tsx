import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { CommentForm } from './comment-form.js';

beforeEach(() => refresh.mockClear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CommentForm', () => {
  it('posts the comment body and internal flag, then refreshes', async () => {
    const fetchMock = vi.fn(
      async (..._args: Parameters<typeof fetch>) => new Response('{}', { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<CommentForm ticketId="t1" />);
    await userEvent.type(screen.getByLabelText(/add a comment/i), 'On it');
    await userEvent.click(screen.getByLabelText(/internal note/i));
    await userEvent.click(screen.getByRole('button', { name: /post comment/i }));

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      body: 'On it',
      isInternal: true,
    });
    expect(refresh).toHaveBeenCalled();
  });
});
