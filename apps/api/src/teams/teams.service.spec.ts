import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, type Role } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import { TeamsService } from './teams.service.js';
import { ConflictError, NotFoundError } from '../common/domain-errors.js';

const service = new TeamsService();

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function org(slug = 'acme') {
  return prisma.organization.create({ data: { name: slug, slug, timezone: 'UTC' } });
}
async function user(orgId: string, email: string, role: Role = 'TEAM_LEAD') {
  return prisma.user.create({ data: { orgId, email, name: email, role, passwordHash: 'x' } });
}

describe('TeamsService', () => {
  it('creates a team with a same-organization lead', async () => {
    const acme = await org();
    const lead = await user(acme.id, 'lead@acme.test');
    const team = await service.create(acme.id, { name: 'Support', leadUserId: lead.id });
    expect(team).toMatchObject({ name: 'Support', leadUserId: lead.id });
  });

  it('rejects a duplicate team name within the organization', async () => {
    const acme = await org();
    const lead = await user(acme.id, 'lead@acme.test');
    await service.create(acme.id, { name: 'Support', leadUserId: lead.id });
    await expect(
      service.create(acme.id, { name: 'Support', leadUserId: lead.id }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a lead from another organization', async () => {
    const acme = await org('acme');
    const other = await org('other');
    const otherLead = await user(other.id, 'lead@other.test');
    await expect(
      service.create(acme.id, { name: 'Support', leadUserId: otherLead.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('unassigns members when a team is deleted', async () => {
    const acme = await org();
    const lead = await user(acme.id, 'lead@acme.test');
    const team = await service.create(acme.id, { name: 'Support', leadUserId: lead.id });
    const member = await user(acme.id, 'm@acme.test', 'AGENT');
    await prisma.user.update({ where: { id: member.id }, data: { teamId: team.id } });

    await service.remove(acme.id, team.id);
    expect(await prisma.team.findFirst({ where: { id: team.id } })).toBeNull();
    const after = await prisma.user.findFirstOrThrow({ where: { id: member.id } });
    expect(after.teamId).toBeNull();
  });
});
