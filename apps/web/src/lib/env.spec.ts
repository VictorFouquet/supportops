import { describe, it, expect, afterEach } from 'vitest';
import { getApiUrl } from './env.js';

const original = process.env.API_URL;
afterEach(() => {
  process.env.API_URL = original;
});

describe('getApiUrl', () => {
  it('returns the configured API URL', () => {
    process.env.API_URL = 'http://api.test';
    expect(getApiUrl()).toBe('http://api.test');
  });

  it('throws a clear error when API_URL is unset', () => {
    delete process.env.API_URL;
    expect(() => getApiUrl()).toThrow(/API_URL/);
  });
});
