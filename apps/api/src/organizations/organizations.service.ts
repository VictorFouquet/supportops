import { Injectable } from '@nestjs/common';
import { prisma } from '@supportops/db';
import { NotFoundError } from '../common/domain-errors.js';
import type { OrganizationDto } from './dto/organization.dto.js';
import type { UpdateOrganizationDto } from './dto/update-organization.dto.js';

@Injectable()
export class OrganizationsService {
  async getOwn(orgId: string): Promise<OrganizationDto> {
    const org = await prisma.organization.findFirst({ where: { id: orgId } });
    if (!org) throw new NotFoundError('Organization not found');
    return this.toDto(org);
  }

  async updateOwn(orgId: string, dto: UpdateOrganizationDto): Promise<OrganizationDto> {
    await this.getOwn(orgId); // ensures existence; slug is never touched
    const org = await prisma.organization.update({
      where: { id: orgId },
      data: { name: dto.name, timezone: dto.timezone },
    });
    return this.toDto(org);
  }

  private toDto(org: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  }): OrganizationDto {
    return { id: org.id, name: org.name, slug: org.slug, timezone: org.timezone };
  }
}
