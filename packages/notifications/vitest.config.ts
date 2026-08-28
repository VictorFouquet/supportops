import { defineConfig } from 'vitest/config';

const BASE =
  process.env.TEST_DATABASE_URL ??
  'postgres://supportops:supportops@localhost:5432/supportops_test';
// Dedicated database so these tests never share mutable tables with other suites.
const testDbUrl = BASE.replace(/\/[^/?]+(\?|$)/, '/supportops_notifications_test$1');

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // The DB-backed specs share one database; run files serially to avoid interference.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDbUrl,
    },
  },
});
