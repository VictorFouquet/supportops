import { describe, it, expect } from 'vitest';
import { loadConfig } from './index.js';

const valid = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/supportops',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a-sufficiently-long-secret',
} as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('parses a valid environment and defaults NODE_ENV to development', () => {
    const cfg = loadConfig(valid);
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.DATABASE_URL).toContain('postgres://');
    expect(cfg.REDIS_URL).toContain('redis://');
  });

  it('throws, naming the offending variable, when a required var is missing', () => {
    const { JWT_SECRET: _jwtSecret, ...missing } = valid as Record<string, string>;
    expect(() => loadConfig(missing as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
  });

  it('rejects a JWT secret that is too short', () => {
    expect(() => loadConfig({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
});
