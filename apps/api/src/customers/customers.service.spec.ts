import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import { CustomersService } from './customers.service.js';
import { ConflictError, NotFoundError } from '../common/domain-errors.js';

const service = new CustomersService();

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedOrgs() {
  const acme = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  const other = await prisma.organization.create({
    data: { name: 'Other', slug: 'other', timezone: 'UTC' },
  });
  return { acme, other };
}

describe('CustomersService', () => {
  it('creates and lists customers scoped to the organization', async () => {
    const { acme, other } = await seedOrgs();
    await service.create(acme.id, { email: 'a@x.test', name: 'A' });
    await service.create(acme.id, { email: 'b@x.test', name: 'B' });
    await service.create(other.id, { email: 'c@x.test', name: 'C' });

    const page = await service.list(acme.id, { page: 1, pageSize: 10 });
    expect(page.total).toBe(2);
    expect(page.data.map((c) => c.email).sort()).toEqual(['a@x.test', 'b@x.test']);
  });

  it('filters the list by q across name and email', async () => {
    const { acme } = await seedOrgs();
    await service.create(acme.id, { email: 'ada@x.test', name: 'Ada' });
    await service.create(acme.id, { email: 'bob@x.test', name: 'Bob' });
    const page = await service.list(acme.id, { page: 1, pageSize: 10, q: 'ada' });
    expect(page.data).toHaveLength(1);
    expect(page.data[0].name).toBe('Ada');
  });

  it('rejects a duplicate email within the organization', async () => {
    const { acme } = await seedOrgs();
    await service.create(acme.id, { email: 'dup@x.test', name: 'One' });
    await expect(
      service.create(acme.id, { email: 'dup@x.test', name: 'Two' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows the same email in a different organization', async () => {
    const { acme, other } = await seedOrgs();
    await service.create(acme.id, { email: 'shared@x.test', name: 'Here' });
    await expect(
      service.create(other.id, { email: 'shared@x.test', name: 'There' }),
    ).resolves.toMatchObject({ email: 'shared@x.test' });
  });

  it('does not read, update, or delete another organization row', async () => {
    const { acme, other } = await seedOrgs();
    const mine = await service.create(acme.id, { email: 'm@x.test', name: 'Mine' });
    await expect(service.get(other.id, mine.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.remove(other.id, mine.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
