import { execSync } from 'node:child_process';
import { Client } from 'pg';

const BASE =
  process.env.TEST_DATABASE_URL ??
  'postgres://supportops:supportops@localhost:5432/supportops_test';
// Give the API integration suite its own database so it never shares mutable tables with the db package's tests.
const API_DATABASE_URL = BASE.replace(/\/[^/?]+(\?|$)/, '/supportops_api_test$1');

export default async function setup() {
  const url = new URL(API_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbName}"`);
  } catch (err) {
    if ((err as { code?: string }).code !== '42P04') throw err; // 42P04 = duplicate_database
  } finally {
    await client.end();
  }

  execSync('prisma migrate deploy --schema ../../packages/db/prisma/schema.prisma', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: API_DATABASE_URL },
  });
}
