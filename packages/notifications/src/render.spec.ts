import { describe, it, expect } from 'vitest';
import { renderMessage } from './render.js';

const payload = { ticketId: 't1', ticketSubject: 'Cannot log in' };

describe('renderMessage', () => {
  it('renders an assignment message addressed to the recipient', () => {
    const msg = renderMessage({ type: 'TICKET_ASSIGNED', recipientEmail: 'a@acme.test', payload });
    expect(msg.to).toBe('a@acme.test');
    expect(msg.subject).toContain('assigned');
    expect(msg.subject).toContain('Cannot log in');
    expect(msg.body).toContain('Cannot log in');
  });

  it('renders a comment message', () => {
    const msg = renderMessage({ type: 'TICKET_COMMENTED', recipientEmail: 'a@acme.test', payload });
    expect(msg.subject).toContain('comment');
    expect(msg.body).toContain('Cannot log in');
  });
});
