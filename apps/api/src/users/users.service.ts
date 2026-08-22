import { Injectable } from '@nestjs/common';
import { hashPassword, verifyPassword } from '@supportops/auth';
import { prisma, type Role } from '@supportops/db';
import { ConflictError, ForbiddenActionError, NotFoundError } from '../common/domain-errors.js';
import { paginate, type Paginated } from '../common/pagination.js';
import { mapUser, type UserDto } from './dto/user.dto.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  list(
    orgId: string,
    query: { page: number; pageSize: number; q?: string },
  ): Promise<Paginated<UserDto>> {
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
      count: () => prisma.user.count({ where }),
      findMany: async ({ skip, take }) =>
        (await prisma.user.findMany({ where, skip, take, orderBy: { email: 'asc' } })).map(mapUser),
    });
  }

  async get(orgId: string, id: string): Promise<UserDto> {
    return mapUser(await this.getRow(orgId, id));
  }

  async create(orgId: string, actorRole: Role, dto: CreateUserDto): Promise<UserDto> {
    if (dto.role === 'OWNER' && actorRole !== 'OWNER') {
      throw new ForbiddenActionError('Only an owner may create an owner');
    }
    await this.assertEmailFree(orgId, dto.email);
    if (dto.teamId) await this.assertTeamInOrg(orgId, dto.teamId);
    const user = await prisma.user.create({
      data: {
        orgId,
        email: dto.email,
        name: dto.name,
        role: dto.role,
        teamId: dto.teamId ?? null,
        passwordHash: await hashPassword(dto.password),
      },
    });
    return mapUser(user);
  }

  async updateProfile(orgId: string, id: string, dto: UpdateUserDto): Promise<UserDto> {
    await this.getRow(orgId, id);
    if (dto.email) await this.assertEmailFree(orgId, dto.email, id);
    const user = await prisma.user.update({
      where: { id },
      data: { name: dto.name, email: dto.email },
    });
    return mapUser(user);
  }

  async remove(orgId: string, actorUserId: string, id: string): Promise<void> {
    const target = await this.getRow(orgId, id);
    if (target.id === actorUserId) {
      throw new ForbiddenActionError('You cannot delete yourself');
    }
    const ledTeams = await prisma.team.count({ where: { orgId, leadUserId: id } });
    if (ledTeams > 0) {
      throw new ConflictError('Reassign this user’s team lead role before deleting them');
    }
    if (target.role === 'OWNER') await this.assertNotLastOwner(orgId);
    await prisma.user.delete({ where: { id } });
  }

  async updateSelf(userId: string, orgId: string, name: string): Promise<UserDto> {
    await this.getRow(orgId, userId);
    const user = await prisma.user.update({ where: { id: userId }, data: { name } });
    return mapUser(user);
  }

  async changePassword(
    userId: string,
    orgId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.getRow(orgId, userId);
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new ForbiddenActionError('Current password is incorrect');
    }
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });
  }

  async setRole(orgId: string, actorRole: Role, targetId: string, newRole: Role): Promise<UserDto> {
    const target = await this.getRow(orgId, targetId);
    if ((newRole === 'OWNER' || target.role === 'OWNER') && actorRole !== 'OWNER') {
      throw new ForbiddenActionError('Only an owner may grant or change the owner role');
    }
    if (target.role === 'OWNER' && newRole !== 'OWNER') {
      await this.assertNotLastOwner(orgId);
    }
    const user = await prisma.user.update({ where: { id: targetId }, data: { role: newRole } });
    return mapUser(user);
  }

  async assignTeam(orgId: string, targetId: string, teamId: string | null): Promise<UserDto> {
    await this.getRow(orgId, targetId);
    if (teamId !== null) await this.assertTeamInOrg(orgId, teamId);
    const user = await prisma.user.update({ where: { id: targetId }, data: { teamId } });
    return mapUser(user);
  }

  /** Fetch an organization-scoped row (with the hash) for internal use; 404 if absent. */
  private async getRow(orgId: string, id: string) {
    const user = await prisma.user.findFirst({ where: { id, orgId } });
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  private async assertEmailFree(orgId: string, email: string, exceptId?: string): Promise<void> {
    const existing = await prisma.user.findFirst({ where: { orgId, email } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictError('A user with this email already exists');
    }
  }

  private async assertTeamInOrg(orgId: string, teamId: string): Promise<void> {
    const team = await prisma.team.findFirst({ where: { id: teamId, orgId } });
    if (!team) throw new NotFoundError('Team not found');
  }

  private async assertNotLastOwner(orgId: string): Promise<void> {
    const owners = await prisma.user.count({ where: { orgId, role: 'OWNER' } });
    if (owners <= 1) throw new ForbiddenActionError('An organization must keep at least one owner');
  }
}
