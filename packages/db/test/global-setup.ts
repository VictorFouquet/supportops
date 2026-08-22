import { execSync } from 'node:child_process';
import { Client } from 'pg';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://supportops:supportops@localhost:5432/supportops_test';

export default async function setup() {
  // Ensure the dedicated test database exists (connect to the maintenance db).
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbName}"`);
  } catch (err) {
    // 42P04 = duplicate_database; anything else is a real failure.
    if ((err as { code?: string }).code !== '42P04') throw err;
  } finally {
    await client.end();
  }

  // Apply committed migrations to the test database.
  execSync('prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
