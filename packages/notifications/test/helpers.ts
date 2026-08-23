import { prisma } from '@supportops/db';

/** Empty every domain table between tests. CASCADE clears dependent rows. */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE notifications, ticket_comments, tickets, customers, teams, users, organizations RESTART IDENTITY CASCADE',
  );
}

/** A minimal organization with one agent — the recipient of a notification. */
export async function seedOrgUser() {
  const org = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'agent@acme.test',
      name: 'Agent',
      role: 'AGENT',
      passwordHash: 'x',
    },
  });
  return { org, user };
}
