import { describe, it, expect } from 'vitest';
import { NOTIFICATION_QUEUE_NAME, createRedisConnection } from './index.js';

describe('notification queue', () => {
  it('names the queue "notifications"', () => {
    expect(NOTIFICATION_QUEUE_NAME).toBe('notifications');
  });

  it('creates a fail-fast, lazy connection for the producer', () => {
    const connection = createRedisConnection('redis://localhost:6379', { failFast: true });
    expect(connection.options.enableOfflineQueue).toBe(false);
    expect(connection.options.maxRetriesPerRequest).toBeNull();
    expect(connection.options.lazyConnect).toBe(true);
    connection.disconnect();
  });

  it('creates a resilient connection by default for the worker', () => {
    const connection = createRedisConnection('redis://localhost:6379');
    expect(connection.options.enableOfflineQueue).toBe(true);
    expect(connection.options.maxRetriesPerRequest).toBeNull();
    connection.disconnect();
  });
});
