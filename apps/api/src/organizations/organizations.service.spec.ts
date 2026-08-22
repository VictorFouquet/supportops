import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import { OrganizationsService } from './organizations.service.js';
import { NotFoundError } from '../common/domain-errors.js';

const service = new OrganizationsService();

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedOrg() {
  return prisma.organization.create({ data: { name: 'Acme', slug: 'acme', timezone: 'UTC' } });
}

describe('OrganizationsService', () => {
  it('returns the caller organization', async () => {
    const org = await seedOrg();
    expect(await service.getOwn(org.id)).toEqual({
      id: org.id,
      name: 'Acme',
      slug: 'acme',
      timezone: 'UTC',
    });
  });

  it('updates name and timezone but never the slug', async () => {
    const org = await seedOrg();
    const updated = await service.updateOwn(org.id, { name: 'Acme Inc', timezone: 'Europe/Paris' });
    expect(updated).toEqual({
      id: org.id,
      name: 'Acme Inc',
      slug: 'acme',
      timezone: 'Europe/Paris',
    });
  });

  it('throws NotFoundError for an unknown organization', async () => {
    await expect(service.getOwn('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
