import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentOrg, CurrentUser, JwtAuthGuard, type AuthPrincipal } from '@supportops/auth';
import { PageQueryDto, type Paginated } from '../common/pagination.js';
import { TicketsService } from './tickets.service.js';
import { TicketCommentsService } from './ticket-comments.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { UpdateTicketDto } from './dto/update-ticket.dto.js';
import { AssignTicketDto } from './dto/assign-ticket.dto.js';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto.js';
import { ListTicketsDto } from './dto/list-tickets.dto.js';
import { CreateTicketCommentDto } from './dto/create-ticket-comment.dto.js';
import type { TicketDto } from './dto/ticket.dto.js';
import type { TicketCommentDto } from './dto/ticket-comment.dto.js';

@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly comments: TicketCommentsService,
  ) {}

  @Get()
  list(@CurrentOrg() orgId: string, @Query() query: ListTicketsDto): Promise<Paginated<TicketDto>> {
    return this.tickets.list(orgId, query);
  }

  @Get(':id')
  get(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string): Promise<TicketDto> {
    return this.tickets.get(orgId, id);
  }

  @Post()
  create(@CurrentOrg() orgId: string, @Body() dto: CreateTicketDto): Promise<TicketDto> {
    return this.tickets.create(orgId, dto);
  }

  @Patch(':id')
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketDto,
  ): Promise<TicketDto> {
    return this.tickets.update(orgId, id, dto);
  }

  @Patch(':id/assignment')
  assign(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTicketDto,
  ): Promise<TicketDto> {
    return this.tickets.assign(orgId, id, dto);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketStatusDto,
  ): Promise<TicketDto> {
    return this.tickets.setStatus(orgId, id, dto.status);
  }

  @Get(':id/comments')
  listComments(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PageQueryDto,
  ): Promise<Paginated<TicketCommentDto>> {
    return this.comments.list(orgId, id, query);
  }

  @Post(':id/comments')
  addComment(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTicketCommentDto,
  ): Promise<TicketCommentDto> {
    return this.comments.create(orgId, id, actor.userId, dto);
  }
}
