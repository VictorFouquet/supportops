import { Injectable } from '@nestjs/common';
import { prisma } from '@supportops/db';
import { ConflictError, NotFoundError } from '../common/domain-errors.js';
import { paginate, type Paginated } from '../common/pagination.js';
import type { CustomerDto } from './dto/customer.dto.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';

@Injectable()
export class CustomersService {
  list(
    orgId: string,
    query: { page: number; pageSize: number; q?: string },
  ): Promise<Paginated<CustomerDto>> {
    const where = {
      orgId,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    return paginate(query, {
      count: () => prisma.customer.count({ where }),
      findMany: async ({ skip, take }) =>
        (await prisma.customer.findMany({ where, skip, take, orderBy: { email: 'asc' } })).map(
          (c) => this.toDto(c),
        ),
    });
  }

  async get(orgId: string, id: string): Promise<CustomerDto> {
    const customer = await prisma.customer.findFirst({ where: { id, orgId } });
    if (!customer) throw new NotFoundError('Customer not found');
    return this.toDto(customer);
  }

  async create(orgId: string, dto: CreateCustomerDto): Promise<CustomerDto> {
    await this.assertEmailFree(orgId, dto.email);
    const customer = await prisma.customer.create({
      data: { orgId, email: dto.email, name: dto.name },
    });
    return this.toDto(customer);
  }

  async update(orgId: string, id: string, dto: UpdateCustomerDto): Promise<CustomerDto> {
    await this.get(orgId, id);
    if (dto.email) await this.assertEmailFree(orgId, dto.email, id);
    const customer = await prisma.customer.update({
      where: { id },
      data: { email: dto.email, name: dto.name },
    });
    return this.toDto(customer);
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.get(orgId, id);
    await prisma.customer.delete({ where: { id } });
  }

  private async assertEmailFree(orgId: string, email: string, exceptId?: string): Promise<void> {
    const existing = await prisma.customer.findFirst({ where: { orgId, email } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictError('A customer with this email already exists');
    }
  }

  private toDto(customer: { id: string; email: string; name: string }): CustomerDto {
    return { id: customer.id, email: customer.email, name: customer.name };
  }
}
