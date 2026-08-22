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
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { SetRoleDto } from './dto/set-role.dto.js';
import { AssignTeamDto } from './dto/assign-team.dto.js';
import type { UserDto } from './dto/user.dto.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentOrg() orgId: string, @Query() query: PageQueryDto): Promise<Paginated<UserDto>> {
    return this.users.list(orgId, query);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateSelf(@CurrentUser() actor: AuthPrincipal, @Body() dto: UpdateMeDto): Promise<UserDto> {
    return this.users.updateSelf(actor.userId, actor.orgId, dto.name);
  }

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  changePassword(
    @CurrentUser() actor: AuthPrincipal,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.users.changePassword(
      actor.userId,
      actor.orgId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  get(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string): Promise<UserDto> {
    return this.users.get(orgId, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  create(@CurrentUser() actor: AuthPrincipal, @Body() dto: CreateUserDto): Promise<UserDto> {
    return this.users.create(actor.orgId, actor.role, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDto> {
    return this.users.updateProfile(orgId, id, dto);
  }

  @Patch(':id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  setRole(
    @CurrentUser() actor: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoleDto,
  ): Promise<UserDto> {
    return this.users.setRole(actor.orgId, actor.role, id, dto.role);
  }

  @Patch(':id/team')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  assignTeam(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTeamDto,
  ): Promise<UserDto> {
    return this.users.assignTeam(orgId, id, dto.teamId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @HttpCode(204)
  remove(
    @CurrentUser() actor: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.users.remove(actor.orgId, actor.userId, id);
  }
}
