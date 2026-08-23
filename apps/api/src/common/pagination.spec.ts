import { describe, it, expect } from 'vitest';
import { paginate } from './pagination.js';

describe('paginate', () => {
  it('returns the requested slice with envelope metadata', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const result = await paginate(
      { page: 2, pageSize: 2 },
      {
        count: async () => rows.length,
        findMany: async ({ skip, take }) => rows.slice(skip, skip + take),
      },
    );
    expect(result).toEqual({ data: [{ id: 2 }, { id: 3 }], page: 2, pageSize: 2, total: 5 });
  });

  it('reports the total independently of the returned page size', async () => {
    const result = await paginate(
      { page: 1, pageSize: 10 },
      { count: async () => 42, findMany: async () => [] },
    );
    expect(result.total).toBe(42);
    expect(result.data).toEqual([]);
  });
});
