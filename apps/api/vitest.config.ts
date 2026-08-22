import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const testDbUrl =
  process.env.TEST_DATABASE_URL ??
  'postgres://supportops:supportops@localhost:5432/supportops_test';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    globalSetup: ['./test/global-setup.ts'],
    // Integration tests share one database; run files serially.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDbUrl,
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      JWT_SECRET: process.env.JWT_SECRET ?? 'test-secret-at-least-16-chars',
    },
  },
});
