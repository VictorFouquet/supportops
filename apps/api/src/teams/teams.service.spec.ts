import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, type Role } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import { TeamsService } from './teams.service.js';
import { ConflictError, ForbiddenActionError, NotFoundError } from '../common/domain-errors.js';

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

describe('TeamsService.manageMembers', () => {
  it('adds and removes members', async () => {
    const acme = await org();
    const lead = await user(acme.id, 'lead@acme.test');
    const team = await service.create(acme.id, { name: 'Support', leadUserId: lead.id });
    const member = await user(acme.id, 'm@acme.test', 'AGENT');

    await service.manageMembers(acme.id, { userId: lead.id, role: 'ADMIN' }, team.id, {
      add: [member.id],
    });
    expect((await prisma.user.findFirstOrThrow({ where: { id: member.id } })).teamId).toBe(team.id);

    await service.manageMembers(acme.id, { userId: lead.id, role: 'ADMIN' }, team.id, {
      remove: [member.id],
    });
    expect((await prisma.user.findFirstOrThrow({ where: { id: member.id } })).teamId).toBeNull();
  });

  it('lets a team lead manage only the team they lead', async () => {
    const acme = await org();
    const lead = await user(acme.id, 'lead@acme.test');
    const otherLead = await user(acme.id, 'other-lead@acme.test');
    const mine = await service.create(acme.id, { name: 'Mine', leadUserId: lead.id });
    const theirs = await service.create(acme.id, { name: 'Theirs', leadUserId: otherLead.id });
    const member = await user(acme.id, 'm@acme.test', 'AGENT');

    await expect(
      service.manageMembers(acme.id, { userId: lead.id, role: 'TEAM_LEAD' }, mine.id, {
        add: [member.id],
      }),
    ).resolves.toBeUndefined();
    await expect(
      service.manageMembers(acme.id, { userId: lead.id, role: 'TEAM_LEAD' }, theirs.id, {
        add: [member.id],
      }),
    ).rejects.toBeInstanceOf(ForbiddenActionError);
  });

  it('rejects a member from another organization', async () => {
    const acme = await org('acme');
    const other = await org('other');
    const lead = await user(acme.id, 'lead@acme.test');
    const team = await service.create(acme.id, { name: 'Support', leadUserId: lead.id });
    const outsider = await user(other.id, 'x@other.test', 'AGENT');
    await expect(
      service.manageMembers(acme.id, { userId: lead.id, role: 'ADMIN' }, team.id, {
        add: [outsider.id],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
