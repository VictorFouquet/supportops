import { describe, it, expect } from 'vitest';
import { nameIndex, displayName } from './lookups.js';

describe('lookups', () => {
  it('indexes items by id and resolves display names', () => {
    const index = nameIndex([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bo' },
    ]);
    expect(displayName(index, 'a')).toBe('Ada');
    expect(displayName(index, null)).toBe('—');
    expect(displayName(index, 'missing')).toBe('Unknown');
  });
});
