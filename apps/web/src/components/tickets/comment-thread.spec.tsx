import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommentThread } from './comment-thread.js';

const authorNames = new Map([['u1', 'Ada Agent']]);

describe('CommentThread', () => {
  it('renders comments with author, body, and an internal marker', () => {
    render(
      <CommentThread
        authorNames={authorNames}
        comments={[
          {
            id: 'c1',
            ticketId: 't1',
            authorType: 'AGENT',
            authorId: 'u1',
            body: 'Looking into it',
            isInternal: true,
            createdAt: '2026-08-29T14:05:00.000Z',
          },
        ]}
      />,
    );
    expect(screen.getByText('Ada Agent')).toBeInTheDocument();
    expect(screen.getByText('Looking into it')).toBeInTheDocument();
    expect(screen.getByText(/internal note/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no comments', () => {
    render(<CommentThread authorNames={authorNames} comments={[]} />);
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
  });
});
