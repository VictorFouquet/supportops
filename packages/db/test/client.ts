import { PrismaClient } from '@prisma/client';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://supportops:supportops@localhost:5432/supportops_test';

export const testPrisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

/** Empty every domain table between tests. CASCADE clears dependent rows. */
export async function resetDb() {
  await testPrisma.$executeRawUnsafe(
    'TRUNCATE TABLE notifications, ticket_comments, tickets, customers, teams, users, organizations RESTART IDENTITY CASCADE',
  );
}
