import { Injectable } from '@nestjs/common';
import { prisma } from '@supportops/db';
import { ConflictError, ForbiddenActionError, NotFoundError } from '../common/domain-errors.js';
import { paginate, type Paginated } from '../common/pagination.js';
import type { TeamDto } from './dto/team.dto.js';
import type { CreateTeamDto } from './dto/create-team.dto.js';

@Injectable()
export class TeamsService {
  list(
    orgId: string,
    query: { page: number; pageSize: number; q?: string },
  ): Promise<Paginated<TeamDto>> {
    const where = {
      orgId,
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
    };
    return paginate(query, {
      count: () => prisma.team.count({ where }),
      findMany: async ({ skip, take }) =>
        (await prisma.team.findMany({ where, skip, take, orderBy: { name: 'asc' } })).map((t) =>
          this.toDto(t),
        ),
    });
  }

  async get(orgId: string, id: string): Promise<TeamDto> {
    return this.toDto(await this.getRow(orgId, id));
  }

  async create(orgId: string, dto: CreateTeamDto): Promise<TeamDto> {
    await this.assertNameFree(orgId, dto.name);
    await this.assertUserInOrg(orgId, dto.leadUserId);
    const team = await prisma.team.create({
      data: { orgId, name: dto.name, leadUserId: dto.leadUserId },
    });
    return this.toDto(team);
  }

  async rename(orgId: string, id: string, name: string): Promise<TeamDto> {
    await this.getRow(orgId, id);
    await this.assertNameFree(orgId, name, id);
    const team = await prisma.team.update({ where: { id }, data: { name } });
    return this.toDto(team);
  }

  async setLead(orgId: string, id: string, leadUserId: string): Promise<TeamDto> {
    await this.getRow(orgId, id);
    await this.assertUserInOrg(orgId, leadUserId);
    const team = await prisma.team.update({ where: { id }, data: { leadUserId } });
    return this.toDto(team);
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.getRow(orgId, id);
    // Unassign members, then delete, in one transaction.
    await prisma.$transaction([
      prisma.user.updateMany({ where: { orgId, teamId: id }, data: { teamId: null } }),
      prisma.team.delete({ where: { id } }),
    ]);
  }

  async manageMembers(
    orgId: string,
    actor: { userId: string; role: string },
    teamId: string,
    changes: { add?: string[]; remove?: string[] },
  ): Promise<void> {
    const team = await this.getRow(orgId, teamId);
    if (actor.role === 'TEAM_LEAD' && team.leadUserId !== actor.userId) {
      throw new ForbiddenActionError('A team lead may only manage their own team');
    }
    const add = changes.add ?? [];
    const remove = changes.remove ?? [];
    await this.assertUsersInOrg(orgId, [...add, ...remove]);
    await prisma.$transaction([
      prisma.user.updateMany({ where: { orgId, id: { in: add } }, data: { teamId } }),
      prisma.user.updateMany({
        where: { orgId, id: { in: remove }, teamId },
        data: { teamId: null },
      }),
    ]);
  }

  private async assertUsersInOrg(orgId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await prisma.user.count({ where: { orgId, id: { in: ids } } });
    if (found !== new Set(ids).size) throw new NotFoundError('One or more users were not found');
  }

  private async getRow(orgId: string, id: string) {
    const team = await prisma.team.findFirst({ where: { id, orgId } });
    if (!team) throw new NotFoundError('Team not found');
    return team;
  }

  private async assertNameFree(orgId: string, name: string, exceptId?: string): Promise<void> {
    const existing = await prisma.team.findFirst({ where: { orgId, name } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictError('A team with this name already exists');
    }
  }

  private async assertUserInOrg(orgId: string, userId: string): Promise<void> {
    const user = await prisma.user.findFirst({ where: { id: userId, orgId } });
    if (!user) throw new NotFoundError('Lead user not found');
  }

  private toDto(team: { id: string; name: string; leadUserId: string }): TeamDto {
    return { id: team.id, name: team.name, leadUserId: team.leadUserId };
  }
}
