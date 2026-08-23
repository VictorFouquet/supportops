import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentOrg, JwtAuthGuard, Roles, RolesGuard } from '@supportops/auth';
import { OrganizationsService } from './organizations.service.js';
import { UpdateOrganizationDto } from './dto/update-organization.dto.js';
import type { OrganizationDto } from './dto/organization.dto.js';

@Controller('orgs')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getOwn(@CurrentOrg() orgId: string): Promise<OrganizationDto> {
    return this.organizations.getOwn(orgId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  updateOwn(
    @CurrentOrg() orgId: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OrganizationDto> {
    return this.organizations.updateOwn(orgId, dto);
  }
}
