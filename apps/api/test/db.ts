import { prisma } from '@supportops/db';

/** Empty every domain table between tests. CASCADE clears dependent rows. */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE notifications, ticket_comments, tickets, customers, teams, users, organizations RESTART IDENTITY CASCADE',
  );
}
