import { PrismaClient } from '@prisma/client';

/** Idempotent: safe to run repeatedly against the same database. */
export async function seed(prisma: PrismaClient): Promise<void> {
  const org = await prisma.organization.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { name: 'Acme Support', slug: 'acme', timezone: 'Europe/Paris' },
  });

  await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: 'owner@acme.test' } },
    update: {},
    create: {
      orgId: org.id,
      email: 'owner@acme.test',
      name: 'Olivia Owner',
      role: 'OWNER',
      passwordHash: 'seed-not-a-real-hash',
    },
  });

  const lead = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: 'lead@acme.test' } },
    update: {},
    create: {
      orgId: org.id,
      email: 'lead@acme.test',
      name: 'Leo Lead',
      role: 'TEAM_LEAD',
      passwordHash: 'seed-not-a-real-hash',
    },
  });

  const team = await prisma.team.upsert({
    where: { orgId_name: { orgId: org.id, name: 'Tier 1' } },
    update: {},
    create: { orgId: org.id, name: 'Tier 1', leadUserId: lead.id },
  });

  const agent = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: 'ada@acme.test' } },
    update: {},
    create: {
      orgId: org.id,
      email: 'ada@acme.test',
      name: 'Ada Agent',
      role: 'AGENT',
      teamId: team.id,
      passwordHash: 'seed-not-a-real-hash',
    },
  });

  const customer = await prisma.customer.upsert({
    where: { orgId_email: { orgId: org.id, email: 'cara@customer.test' } },
    update: {},
    create: { orgId: org.id, email: 'cara@customer.test', name: 'Cara Customer' },
  });

  const existing = await prisma.ticket.findFirst({
    where: { orgId: org.id, subject: 'Cannot log in' },
  });
  if (!existing) {
    await prisma.ticket.create({
      data: {
        orgId: org.id,
        customerId: customer.id,
        assigneeId: agent.id,
        teamId: team.id,
        subject: 'Cannot log in',
        description: 'The password reset link loops back to the login page.',
        priority: 'HIGH',
        comments: {
          create: [
            {
              authorType: 'CUSTOMER',
              authorId: customer.id,
              body: 'Still stuck after three tries.',
            },
            {
              authorType: 'AGENT',
              authorId: agent.id,
              body: 'Looking into it now.',
              isInternal: false,
            },
          ],
        },
      },
    });
  }
}
