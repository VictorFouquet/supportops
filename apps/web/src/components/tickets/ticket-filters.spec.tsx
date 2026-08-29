import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { TicketFilters } from './ticket-filters.js';

beforeEach(() => push.mockClear());

describe('TicketFilters', () => {
  it('pushes the selected status to the query string', async () => {
    render(<TicketFilters current={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'OPEN');
    expect(push).toHaveBeenCalledWith('/tickets?status=OPEN');
  });

  it('clears a filter when "All" is chosen', async () => {
    render(<TicketFilters current={{ status: 'OPEN' }} />);
    await userEvent.selectOptions(screen.getByLabelText(/status/i), '');
    expect(push).toHaveBeenCalledWith('/tickets');
  });
});
