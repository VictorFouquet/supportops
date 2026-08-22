import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { verifyPassword } from '@supportops/auth';
import { prisma, type Role } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import { UsersService } from './users.service.js';
import { ConflictError, ForbiddenActionError, NotFoundError } from '../common/domain-errors.js';

const service = new UsersService();

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function org(slug = 'acme') {
  return prisma.organization.create({ data: { name: slug, slug, timezone: 'UTC' } });
}
async function user(orgId: string, email: string, role: Role) {
  return prisma.user.create({
    data: { orgId, email, name: email, role, passwordHash: 'x' },
  });
}

describe('UsersService.create', () => {
  it('hashes the initial password and returns a DTO without the hash', async () => {
    const acme = await org();
    const created = await service.create(acme.id, 'OWNER', {
      email: 'new@acme.test',
      name: 'New',
      role: 'AGENT',
      password: 'initial-password',
    });
    expect(created).not.toHaveProperty('passwordHash');
    const row = await prisma.user.findFirstOrThrow({ where: { id: created.id } });
    expect(await verifyPassword(row.passwordHash, 'initial-password')).toBe(true);
  });

  it('rejects a duplicate email within the organization', async () => {
    const acme = await org();
    await user(acme.id, 'dup@acme.test', 'AGENT');
    await expect(
      service.create(acme.id, 'OWNER', {
        email: 'dup@acme.test',
        name: 'Dup',
        role: 'AGENT',
        password: 'initial-password',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('forbids a non-owner from creating an owner', async () => {
    const acme = await org();
    await expect(
      service.create(acme.id, 'ADMIN', {
        email: 'owner2@acme.test',
        name: 'Owner2',
        role: 'OWNER',
        password: 'initial-password',
      }),
    ).rejects.toBeInstanceOf(ForbiddenActionError);
  });
});

describe('UsersService.remove', () => {
  it('forbids deleting the last owner', async () => {
    const acme = await org();
    const owner = await user(acme.id, 'owner@acme.test', 'OWNER');
    const admin = await user(acme.id, 'admin@acme.test', 'ADMIN');
    await expect(service.remove(acme.id, admin.id, owner.id)).rejects.toBeInstanceOf(
      ForbiddenActionError,
    );
  });

  it('forbids deleting a user who leads a team', async () => {
    const acme = await org();
    const owner = await user(acme.id, 'owner@acme.test', 'OWNER');
    const lead = await user(acme.id, 'lead@acme.test', 'TEAM_LEAD');
    await prisma.team.create({ data: { orgId: acme.id, name: 'Support', leadUserId: lead.id } });
    await expect(service.remove(acme.id, owner.id, lead.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('forbids deleting yourself', async () => {
    const acme = await org();
    const owner = await user(acme.id, 'owner@acme.test', 'OWNER');
    await expect(service.remove(acme.id, owner.id, owner.id)).rejects.toBeInstanceOf(
      ForbiddenActionError,
    );
  });

  it('deletes an ordinary user', async () => {
    const acme = await org();
    const owner = await user(acme.id, 'owner@acme.test', 'OWNER');
    const agent = await user(acme.id, 'agent@acme.test', 'AGENT');
    await service.remove(acme.id, owner.id, agent.id);
    expect(await prisma.user.findFirst({ where: { id: agent.id } })).toBeNull();
  });
});

describe('UsersService.changePassword', () => {
  it('requires the correct current password', async () => {
    const acme = await org();
    const created = await service.create(acme.id, 'OWNER', {
      email: 'u@acme.test',
      name: 'U',
      role: 'AGENT',
      password: 'initial-password',
    });
    await expect(
      service.changePassword(created.id, acme.id, 'wrong', 'brand-new-password'),
    ).rejects.toBeInstanceOf(ForbiddenActionError);
    await service.changePassword(created.id, acme.id, 'initial-password', 'brand-new-password');
    const row = await prisma.user.findFirstOrThrow({ where: { id: created.id } });
    expect(await verifyPassword(row.passwordHash, 'brand-new-password')).toBe(true);
  });
});

describe('UsersService cross-organization', () => {
  it('does not find a user from another organization', async () => {
    const acme = await org('acme');
    const other = await org('other');
    const u = await user(acme.id, 'a@acme.test', 'AGENT');
    await expect(service.get(other.id, u.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
