import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentOrg,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  type AuthPrincipal,
} from '@supportops/auth';
import { PageQueryDto, type Paginated } from '../common/pagination.js';
import { TeamsService } from './teams.service.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { UpdateTeamDto } from './dto/update-team.dto.js';
import { SetLeadDto } from './dto/set-lead.dto.js';
import { ManageMembersDto } from './dto/manage-members.dto.js';
import type { TeamDto } from './dto/team.dto.js';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentOrg() orgId: string, @Query() query: PageQueryDto): Promise<Paginated<TeamDto>> {
    return this.teams.list(orgId, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  get(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string): Promise<TeamDto> {
    return this.teams.get(orgId, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  create(@CurrentOrg() orgId: string, @Body() dto: CreateTeamDto): Promise<TeamDto> {
    return this.teams.create(orgId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  rename(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
  ): Promise<TeamDto> {
    return this.teams.rename(orgId, id, dto.name);
  }

  @Patch(':id/lead')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  setLead(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetLeadDto,
  ): Promise<TeamDto> {
    return this.teams.setLead(orgId, id, dto.leadUserId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @HttpCode(204)
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.teams.remove(orgId, id);
  }

  @Patch(':id/members')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'TEAM_LEAD')
  @HttpCode(204)
  manageMembers(
    @CurrentUser() actor: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ManageMembersDto,
  ): Promise<void> {
    return this.teams.manageMembers(
      actor.orgId,
      { userId: actor.userId, role: actor.role },
      id,
      dto,
    );
  }
}
