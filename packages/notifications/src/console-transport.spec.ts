import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConsoleTransport } from './console-transport.js';

afterEach(() => vi.restoreAllMocks());

describe('ConsoleTransport', () => {
  it('logs the recipient and subject', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await new ConsoleTransport().send({
      to: 'agent@acme.test',
      subject: 'Ticket assigned to you: Cannot log in',
      body: 'Sam assigned ticket "Cannot log in" to you.',
    });
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain('agent@acme.test');
    expect(log.mock.calls[0]?.[0]).toContain('Cannot log in');
  });
});
