import { describe, it, expect } from 'vitest';
import { formatDateTime } from './format.js';

describe('formatDateTime', () => {
  it('formats an ISO timestamp as YYYY-MM-DD HH:mm in UTC', () => {
    expect(formatDateTime('2026-08-29T14:05:00.000Z')).toBe('2026-08-29 14:05');
  });
});
