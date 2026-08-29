# Phase 5 — Tickets & comments (`tickets`)

> Executed task by task. Each task is a small, independently testable slice that ends green — tests, lint, and typecheck all passing — before the next begins. Steps use checkboxes (`- [ ]`) for tracking.

**Goal:** Build the tickets HTTP surface on top of the domain-management foundation — ticket CRUD and filtered listing, assignment to an agent and/or team, a governed status lifecycle, and threaded comments — reusing the established authorization, pagination, and error conventions.

**Architecture:** One NestJS feature module (`apps/api/src/tickets/`) in the established `Controller → Service → Prisma` shape, with `class-validator` input DTOs and explicit interface output DTOs mapped in the service. Comments are handled as a nested resource of a ticket inside the same module (`TicketCommentsService`, routes under `/tickets/:id/comments`). `JwtAuthGuard` alone gates the controller — every authenticated role may work tickets — and every conditional rule (organization scoping, assignment validation, the status-transition map) lives in the service beside the query it constrains. A `ListTicketsDto` extends the shared `PageQueryDto` with resource-specific filters.

**Tech Stack:** NestJS 10 (`@nestjs/common`, `@nestjs/core`), `class-validator` + `class-transformer`, Prisma 5 / PostgreSQL 16, Vitest 2 with `unplugin-swc`, `supertest`, TypeScript 5.5.

**Spec:** none in this repository — the requirements are captured in the ADRs written in Task 1 (`docs/adr/0011`, `docs/adr/0012`) and in the existing `docs/architecture.md`.

## Global Constraints

- **RBAC-always.** Every route sits behind `JwtAuthGuard`. Tickets carry no `@Roles` restriction (every authenticated role works tickets); no new auth path is invented — everything reuses `@supportops/auth`.
- **Prisma stays in services.** Only `*.service.ts` touches the `@supportops/db` client. Controllers, guards, and DTOs never do.
- **Responses are DTOs.** Endpoints return explicit interface DTO shapes mapped in the service (`mapTicket`, `mapComment`). No Prisma row is returned raw.
- **Organization isolation on every query.** Every read and write is scoped by the caller's `orgId` (from `@CurrentOrg()`). A ticket, customer, assignee, or team in another organization is invisible and yields **404, never 403**.
- **Lists are page-based envelopes.** List endpoints accept `?page=&pageSize=&q=` (`pageSize` capped at 100) via the shared `PageQueryDto`/`paginate()`; the ticket list additionally accepts `?status=&priority=&assigneeId=&teamId=`.
- **Status changes are governed.** A ticket's `status` only moves along the legal-transition map in `TicketsService`; an illegal move is a `409`. `closedAt` is maintained only by that logic.
- **Time is UTC.** Timestamps remain `timestamptz` in UTC (unchanged from Phase 2); `closedAt` is set with a server `Date`.
- **Tests are non-optional.** Every service method has a co-located unit test against a real Postgres; every endpoint has an integration test with `supertest`.
- Node `>=20` (local and CI run Node 24); pnpm only (9.7.0); commits carry `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; work lands on `develop` via a feature branch and PR.

---

### Task 1: Record the ticket lifecycle and authorization decisions (ADRs 0011, 0012)

**Files:**

- Create: `docs/adr/0011-ticket-lifecycle-and-status-transitions.md`, `docs/adr/0012-ticket-authorization-and-comments.md`
- Modify: `docs/adr/README.md` (append two rows)

**Interfaces:**

- Consumes: nothing (documentation).
- Produces: the accepted decisions the rest of the phase implements — the status-transition map and `closedAt` rule (0011); the ticket authorization model, assignment validation, no-delete rule, and comment authorship (0012).

- [ ] **Step 1: Write ADR 0011**

`docs/adr/0011-ticket-lifecycle-and-status-transitions.md`:

```markdown
# 0011 — Ticket lifecycle and status transitions

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

Tickets move through a lifecycle: `OPEN`, `PENDING` (waiting on the customer),
`RESOLVED` (an agent believes the work is done), and `CLOSED`. Left
unconstrained, a status field invites nonsensical jumps (for example straight
from `CLOSED` back to `RESOLVED`) and inconsistent bookkeeping about when a
ticket was closed. We want one predictable place that defines which moves are
allowed and keeps the closed timestamp correct.

## Decision

- **A single legal-transition map in `TicketsService`** is the authority on
  allowed moves:
  - `OPEN → PENDING, RESOLVED`
  - `PENDING → OPEN, RESOLVED`
  - `RESOLVED → OPEN` (reopen), `CLOSED`
  - `CLOSED → OPEN` (reopen)

  An illegal transition raises `ConflictError` (409); the message names the
  offending move.

- **`closedAt` is maintained only by the transition logic** — set to the current
  time when a ticket enters `CLOSED`, cleared when a ticket leaves `CLOSED`. It
  is never edited directly.
- **Status changes go through a dedicated endpoint** (`PATCH /tickets/:id/status`),
  separate from editing a ticket's subject, description, or priority, so the
  transition rules live in exactly one place.

## Consequences

- Every allowed edge is a one-line service unit test; every rejected edge is a
  clean 409.
- Reopening a resolved or closed ticket is a first-class move, so agents never
  create duplicate tickets just to continue work.
- `closedAt` reliably reflects the most recent close and is `null` whenever a
  ticket is active.
```

- [ ] **Step 2: Write ADR 0012**

`docs/adr/0012-ticket-authorization-and-comments.md`:

```markdown
# 0012 — Ticket authorization, assignment, and comment authorship

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

Working tickets is the core job of every agent, whatever their role. We need to
decide who may act on tickets, how assignment is validated, and how comments
capture who is speaking — bearing in mind that customers are not users of this
system and cannot sign in.

## Decision

- **Tickets are reachable by every authenticated role.** The coarse guard is
  `JwtAuthGuard` alone (no `@Roles` restriction) for reading, creating,
  updating, assigning, transitioning, and commenting. This mirrors how customer
  records are already writable by every role.
- **Organization isolation is the real protection**, enforced in the service:
  every ticket, customer, assignee, and team is looked up scoped by the caller's
  organization; anything in another organization is invisible and yields **404,
  never 403**.
- **Assignment is nullable and validated.** `assigneeId` must be a user in the
  same organization and `teamId` a team in the same organization; either may be
  set to `null` to unassign. Assignment has its own endpoint
  (`PATCH /tickets/:id/assignment`).
- **Tickets are not deletable.** `CLOSED` is the terminal record state; support
  tickets are kept as history rather than purged.
- **Comments are always created by the authenticated agent.** `authorType`
  records whether a comment is the agent speaking (`AGENT`, the default) or the
  agent recording something on the customer's behalf (`CUSTOMER`) — for example
  logging a phone call or pasting in a forwarded email; there is no customer
  sign-in. `isInternal` marks a comment as an agent-only note. Comments are
  append-only in this iteration (no edit or delete).

## Consequences

- The permission surface for tickets is trivial to reason about: one guard, plus
  organization scoping proven by unit tests.
- `authorType` keeps agent- and customer-originated messages distinguishable in
  a ticket's history even though only agents authenticate.
- Should a customer-facing portal ever be introduced, customer-authored comments
  and their authentication become a separate, separately recorded decision.
```

- [ ] **Step 3: Append the two rows to the ADR index**

In `docs/adr/README.md`, add after the `0010` row:

```markdown
| 0011 | Ticket lifecycle and status transitions | Accepted |
| 0012 | Ticket authorization, assignment, and comments | Accepted |
```

- [ ] **Step 4: Verify formatting and commit**

```bash
cd /home/victor/Documents/coding/supportops
pnpm exec prettier --check "docs/**/*.md"
```

Expected: the new files are reported as formatted (run `pnpm exec prettier --write "docs/**/*.md"` if not, then re-check).

```bash
git add -A
git commit -m "docs(adr): record ticket lifecycle and authorization model

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Ticket DTOs and `TicketsService` create/get/list (TDD)

**Files:**

- Create: `apps/api/src/tickets/dto/ticket.dto.ts`, `apps/api/src/tickets/dto/create-ticket.dto.ts`, `apps/api/src/tickets/dto/update-ticket.dto.ts`, `apps/api/src/tickets/dto/list-tickets.dto.ts`, `apps/api/src/tickets/tickets.service.ts`, `apps/api/src/tickets/tickets.service.spec.ts`

**Interfaces:**

- Consumes: `prisma`, `TicketStatus`, `TicketPriority` from `@supportops/db`; `NotFoundError`, `ConflictError` from `common/domain-errors`; `paginate`, `Paginated`, `PageQueryDto` from `common/pagination`.
- Produces:
  - `interface TicketDto { id; customerId; assigneeId: string | null; teamId: string | null; subject; description; status: TicketStatus; priority: TicketPriority; createdAt: Date; updatedAt: Date; closedAt: Date | null }` and `mapTicket(row): TicketDto`
  - `class CreateTicketDto { customerId; subject; description; priority?; assigneeId?; teamId? }`, `class UpdateTicketDto { subject?; description?; priority? }`, `class ListTicketsDto extends PageQueryDto { status?; priority?; assigneeId?; teamId? }`
  - `TicketsService.create(orgId, dto)`, `.get(orgId, id)`, `.list(orgId, query)` — all organization-scoped. (`.update`, `.assign`, `.setStatus` arrive in Task 3.)

- [ ] **Step 1: Write the DTOs**

`apps/api/src/tickets/dto/ticket.dto.ts`:

```ts
import type { TicketPriority, TicketStatus } from '@supportops/db';

export interface TicketDto {
  id: string;
  customerId: string;
  assigneeId: string | null;
  teamId: string | null;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

/** Shared row → DTO mapper; the only place a ticket's public shape is defined. */
export function mapTicket(ticket: {
  id: string;
  customerId: string;
  assigneeId: string | null;
  teamId: string | null;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}): TicketDto {
  return {
    id: ticket.id,
    customerId: ticket.customerId,
    assigneeId: ticket.assigneeId,
    teamId: ticket.teamId,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    closedAt: ticket.closedAt,
  };
}
```

`apps/api/src/tickets/dto/create-ticket.dto.ts`:

```ts
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { TicketPriority } from '@supportops/db';

export class CreateTicketDto {
  @IsUUID()
  customerId!: string;

  @IsString()
  @MinLength(1)
  subject!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}
```

`apps/api/src/tickets/dto/update-ticket.dto.ts`:

```ts
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TicketPriority } from '@supportops/db';

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
```

`apps/api/src/tickets/dto/list-tickets.dto.ts`:

```ts
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TicketPriority, TicketStatus } from '@supportops/db';
import { PageQueryDto } from '../../common/pagination.js';

export class ListTicketsDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}
```

> `TicketPriority`, `TicketStatus`, and (later) `AuthorType` are imported as values for `@IsEnum(...)`; `@supportops/db` re-exports the Prisma enums as runtime values (`export * from '@prisma/client'`).

- [ ] **Step 2: Write the failing service test**

`apps/api/src/tickets/tickets.service.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import { TicketsService } from './tickets.service.js';
import { NotFoundError } from '../common/domain-errors.js';

const service = new TicketsService();

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function seed() {
  const acme = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  const other = await prisma.organization.create({
    data: { name: 'Other', slug: 'other', timezone: 'UTC' },
  });
  const customer = await prisma.customer.create({
    data: { orgId: acme.id, email: 'c@acme.test', name: 'Cust' },
  });
  const agent = await prisma.user.create({
    data: { orgId: acme.id, email: 'a@acme.test', name: 'Agent', role: 'AGENT', passwordHash: 'x' },
  });
  const team = await prisma.team.create({
    data: { orgId: acme.id, name: 'Support', leadUserId: agent.id },
  });
  return { acme, other, customer, agent, team };
}

describe('TicketsService.create', () => {
  it('creates a ticket that defaults to OPEN/NORMAL with no closedAt', async () => {
    const { acme, customer } = await seed();
    const ticket = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'Cannot log in',
      description: 'Password reset loops',
    });
    expect(ticket).toMatchObject({
      customerId: customer.id,
      subject: 'Cannot log in',
      status: 'OPEN',
      priority: 'NORMAL',
      assigneeId: null,
      teamId: null,
      closedAt: null,
    });
  });

  it('accepts a same-organization assignee and team', async () => {
    const { acme, customer, agent, team } = await seed();
    const ticket = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'S',
      description: 'D',
      priority: 'HIGH',
      assigneeId: agent.id,
      teamId: team.id,
    });
    expect(ticket).toMatchObject({ assigneeId: agent.id, teamId: team.id, priority: 'HIGH' });
  });

  it('rejects a customer from another organization with 404', async () => {
    const { acme, other } = await seed();
    const foreign = await prisma.customer.create({
      data: { orgId: other.id, email: 'x@other.test', name: 'X' },
    });
    await expect(
      service.create(acme.id, { customerId: foreign.id, subject: 'S', description: 'D' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects an assignee from another organization with 404', async () => {
    const { acme, other, customer } = await seed();
    const foreignUser = await prisma.user.create({
      data: {
        orgId: other.id,
        email: 'u@other.test',
        name: 'U',
        role: 'AGENT',
        passwordHash: 'x',
      },
    });
    await expect(
      service.create(acme.id, {
        customerId: customer.id,
        subject: 'S',
        description: 'D',
        assigneeId: foreignUser.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('TicketsService.get / list', () => {
  it('does not read another organization ticket (404)', async () => {
    const { acme, other, customer } = await seed();
    const mine = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'S',
      description: 'D',
    });
    await expect(service.get(other.id, mine.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists tickets scoped to the organization in a page envelope', async () => {
    const { acme, other, customer } = await seed();
    await service.create(acme.id, { customerId: customer.id, subject: 'One', description: 'D' });
    await service.create(acme.id, { customerId: customer.id, subject: 'Two', description: 'D' });
    const foreignCustomer = await prisma.customer.create({
      data: { orgId: other.id, email: 'z@other.test', name: 'Z' },
    });
    await service.create(other.id, {
      customerId: foreignCustomer.id,
      subject: 'Nope',
      description: 'D',
    });

    const page = await service.list(acme.id, { page: 1, pageSize: 10 });
    expect(page).toMatchObject({ page: 1, pageSize: 10, total: 2 });
    expect(page.data.map((t) => t.subject).sort()).toEqual(['One', 'Two']);
  });

  it('filters by status, priority, and free text on subject', async () => {
    const { acme, customer } = await seed();
    const a = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'Billing question',
      description: 'D',
      priority: 'HIGH',
    });
    await service.create(acme.id, {
      customerId: customer.id,
      subject: 'Login issue',
      description: 'D',
      priority: 'LOW',
    });
    // Move the first ticket to PENDING so a status filter can distinguish them.
    await prisma.ticket.update({ where: { id: a.id }, data: { status: 'PENDING' } });

    expect((await service.list(acme.id, { page: 1, pageSize: 10, status: 'PENDING' })).total).toBe(
      1,
    );
    expect((await service.list(acme.id, { page: 1, pageSize: 10, priority: 'LOW' })).total).toBe(1);
    const byText = await service.list(acme.id, { page: 1, pageSize: 10, q: 'billing' });
    expect(byText.data).toHaveLength(1);
    expect(byText.data[0].subject).toBe('Billing question');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test -- tickets.service
```

Expected: FAIL — `./tickets.service.js` does not exist yet.

- [ ] **Step 4: Write the service (create/get/list)**

`apps/api/src/tickets/tickets.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { prisma } from '@supportops/db';
import { NotFoundError } from '../common/domain-errors.js';
import { paginate, type Paginated } from '../common/pagination.js';
import { mapTicket, type TicketDto } from './dto/ticket.dto.js';
import type { CreateTicketDto } from './dto/create-ticket.dto.js';
import type { ListTicketsDto } from './dto/list-tickets.dto.js';

@Injectable()
export class TicketsService {
  list(orgId: string, query: ListTicketsDto): Promise<Paginated<TicketDto>> {
    const where = {
      orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.q ? { subject: { contains: query.q, mode: 'insensitive' as const } } : {}),
    };
    return paginate(query, {
      count: () => prisma.ticket.count({ where }),
      findMany: async ({ skip, take }) =>
        (await prisma.ticket.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } })).map(
          (t) => mapTicket(t),
        ),
    });
  }

  async get(orgId: string, id: string): Promise<TicketDto> {
    return mapTicket(await this.getRow(orgId, id));
  }

  async create(orgId: string, dto: CreateTicketDto): Promise<TicketDto> {
    await this.assertCustomerInOrg(orgId, dto.customerId);
    if (dto.assigneeId) await this.assertUserInOrg(orgId, dto.assigneeId);
    if (dto.teamId) await this.assertTeamInOrg(orgId, dto.teamId);
    const ticket = await prisma.ticket.create({
      data: {
        orgId,
        customerId: dto.customerId,
        subject: dto.subject,
        description: dto.description,
        priority: dto.priority,
        assigneeId: dto.assigneeId ?? null,
        teamId: dto.teamId ?? null,
      },
    });
    return mapTicket(ticket);
  }

  private async getRow(orgId: string, id: string) {
    const ticket = await prisma.ticket.findFirst({ where: { id, orgId } });
    if (!ticket) throw new NotFoundError('Ticket not found');
    return ticket;
  }

  private async assertCustomerInOrg(orgId: string, customerId: string): Promise<void> {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, orgId } });
    if (!customer) throw new NotFoundError('Customer not found');
  }

  private async assertUserInOrg(orgId: string, userId: string): Promise<void> {
    const user = await prisma.user.findFirst({ where: { id: userId, orgId } });
    if (!user) throw new NotFoundError('Assignee not found');
  }

  private async assertTeamInOrg(orgId: string, teamId: string): Promise<void> {
    const team = await prisma.team.findFirst({ where: { id: teamId, orgId } });
    if (!team) throw new NotFoundError('Team not found');
  }
}
```

> `update`, `assign`, and `setStatus` (plus the transition map and their imports)
> are added in Task 3 — this task ships a self-contained create/get/list service
> that typechecks and lints on its own. The controller that consumes any method
> is not created until Task 4, so nothing references the Task-3 methods yet.

- [ ] **Step 5: Run to verify green**

```bash
pnpm --filter @supportops/api test -- tickets.service
pnpm --filter @supportops/api typecheck
```

Expected: the create/get/list cases PASS; typecheck exits 0. Root `pnpm exec eslint .` and `pnpm exec prettier --check .` are clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): tickets create, read, and organization-scoped filtered listing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Ticket update, assignment, and status transitions (TDD)

**Files:**

- Create: `apps/api/src/tickets/dto/assign-ticket.dto.ts`, `apps/api/src/tickets/dto/update-ticket-status.dto.ts`
- Modify: `apps/api/src/tickets/tickets.service.ts` (implement `update`, `assign`, `setStatus`), `apps/api/src/tickets/tickets.service.spec.ts` (add cases)

**Interfaces:**

- Consumes: `TicketStatus` from `@supportops/db`; the transition map and `assert*` helpers from Task 2.
- Produces:
  - `class AssignTicketDto { assigneeId?: string | null; teamId?: string | null }` — a field set to `null` unassigns; an omitted field is left unchanged.
  - `class UpdateTicketStatusDto { status: TicketStatus }`
  - `TicketsService.update(orgId, id, dto)`, `.assign(orgId, id, dto)`, `.setStatus(orgId, id, to)`

- [ ] **Step 1: Write the DTOs**

`apps/api/src/tickets/dto/assign-ticket.dto.ts`:

```ts
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Assignment patch. `@IsOptional()` skips validation when a field is `null` or
 * absent, so a client may send `null` to unassign or omit a field to leave it
 * unchanged; a non-null value must be a UUID.
 */
export class AssignTicketDto {
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsUUID()
  teamId?: string | null;
}
```

`apps/api/src/tickets/dto/update-ticket-status.dto.ts`:

```ts
import { IsEnum } from 'class-validator';
import { TicketStatus } from '@supportops/db';

export class UpdateTicketStatusDto {
  @IsEnum(TicketStatus)
  status!: TicketStatus;
}
```

- [ ] **Step 2: Write the failing cases**

First widen the error import at the top of `apps/api/src/tickets/tickets.service.spec.ts` to bring in `ConflictError`:

```ts
import { ConflictError, NotFoundError } from '../common/domain-errors.js';
```

Then append these cases to the same file:

```ts
describe('TicketsService.update / assign', () => {
  it('updates subject, description, and priority', async () => {
    const { acme, customer } = await seed();
    const t = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'Old',
      description: 'Old body',
    });
    const updated = await service.update(acme.id, t.id, {
      subject: 'New',
      priority: 'CRITICAL',
    });
    expect(updated).toMatchObject({
      subject: 'New',
      description: 'Old body',
      priority: 'CRITICAL',
    });
  });

  it('assigns and then unassigns via null', async () => {
    const { acme, customer, agent, team } = await seed();
    const t = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'S',
      description: 'D',
    });
    const assigned = await service.assign(acme.id, t.id, {
      assigneeId: agent.id,
      teamId: team.id,
    });
    expect(assigned).toMatchObject({ assigneeId: agent.id, teamId: team.id });

    const cleared = await service.assign(acme.id, t.id, { assigneeId: null });
    expect(cleared).toMatchObject({ assigneeId: null, teamId: team.id });
  });

  it('rejects assigning a user from another organization (404)', async () => {
    const { acme, other, customer } = await seed();
    const t = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'S',
      description: 'D',
    });
    const foreign = await prisma.user.create({
      data: {
        orgId: other.id,
        email: 'f@other.test',
        name: 'F',
        role: 'AGENT',
        passwordHash: 'x',
      },
    });
    await expect(service.assign(acme.id, t.id, { assigneeId: foreign.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('TicketsService.setStatus', () => {
  async function openTicket() {
    const { acme, customer } = await seed();
    const t = await service.create(acme.id, {
      customerId: customer.id,
      subject: 'S',
      description: 'D',
    });
    return { acme, id: t.id };
  }

  it('walks OPEN → RESOLVED → CLOSED, setting closedAt on close', async () => {
    const { acme, id } = await openTicket();
    await service.setStatus(acme.id, id, 'RESOLVED');
    const closed = await service.setStatus(acme.id, id, 'CLOSED');
    expect(closed.status).toBe('CLOSED');
    expect(closed.closedAt).toBeInstanceOf(Date);
  });

  it('clears closedAt when a closed ticket is reopened', async () => {
    const { acme, id } = await openTicket();
    await service.setStatus(acme.id, id, 'RESOLVED');
    await service.setStatus(acme.id, id, 'CLOSED');
    const reopened = await service.setStatus(acme.id, id, 'OPEN');
    expect(reopened.status).toBe('OPEN');
    expect(reopened.closedAt).toBeNull();
  });

  it('rejects an illegal transition with ConflictError', async () => {
    const { acme, id } = await openTicket(); // status OPEN
    await expect(service.setStatus(acme.id, id, 'CLOSED')).rejects.toBeInstanceOf(ConflictError);
  });

  it('does not transition another organization ticket (404)', async () => {
    const { acme, id } = await openTicket();
    const other = await prisma.organization.create({
      data: { name: 'Z', slug: 'z-org', timezone: 'UTC' },
    });
    await expect(service.setStatus(other.id, id, 'PENDING')).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

- [ ] **Step 3: Run to verify the new cases fail**

```bash
cd /home/victor/Documents/coding/supportops
pnpm --filter @supportops/api test -- tickets.service
```

Expected: FAIL — `service.update`/`service.assign`/`service.setStatus` are not functions yet (they arrive in Step 4).

- [ ] **Step 4: Implement the three methods**

In `apps/api/src/tickets/tickets.service.ts`, widen the `@supportops/db` and error imports and add the two DTO type imports at the top:

```ts
import { prisma, type TicketStatus } from '@supportops/db';
import { ConflictError, NotFoundError } from '../common/domain-errors.js';
import type { UpdateTicketDto } from './dto/update-ticket.dto.js';
import type { AssignTicketDto } from './dto/assign-ticket.dto.js';
```

Add the transition map as a module-level constant (above the `@Injectable()` class):

```ts
/** The only legal status moves. A ticket may not jump along any other edge. */
const LEGAL_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['PENDING', 'RESOLVED'],
  PENDING: ['OPEN', 'RESOLVED'],
  RESOLVED: ['OPEN', 'CLOSED'],
  CLOSED: ['OPEN'],
};
```

Then add the three methods to the class (after `create`, before the private helpers):

```ts
  async update(orgId: string, id: string, dto: UpdateTicketDto): Promise<TicketDto> {
    await this.getRow(orgId, id);
    const ticket = await prisma.ticket.update({
      where: { id },
      data: { subject: dto.subject, description: dto.description, priority: dto.priority },
    });
    return mapTicket(ticket);
  }

  async assign(orgId: string, id: string, dto: AssignTicketDto): Promise<TicketDto> {
    await this.getRow(orgId, id);
    const data: { assigneeId?: string | null; teamId?: string | null } = {};
    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId !== null) await this.assertUserInOrg(orgId, dto.assigneeId);
      data.assigneeId = dto.assigneeId;
    }
    if (dto.teamId !== undefined) {
      if (dto.teamId !== null) await this.assertTeamInOrg(orgId, dto.teamId);
      data.teamId = dto.teamId;
    }
    const ticket = await prisma.ticket.update({ where: { id }, data });
    return mapTicket(ticket);
  }

  async setStatus(orgId: string, id: string, to: TicketStatus): Promise<TicketDto> {
    const current = await this.getRow(orgId, id);
    if (!LEGAL_TRANSITIONS[current.status].includes(to)) {
      throw new ConflictError(`Cannot move a ticket from ${current.status} to ${to}`);
    }
    const data: { status: TicketStatus; closedAt?: Date | null } = { status: to };
    if (to === 'CLOSED') data.closedAt = new Date();
    else if (current.status === 'CLOSED') data.closedAt = null;
    const ticket = await prisma.ticket.update({ where: { id }, data });
    return mapTicket(ticket);
  }
```

- [ ] **Step 5: Run to verify green**

```bash
pnpm --filter @supportops/api test -- tickets.service
pnpm --filter @supportops/api typecheck
```

Expected: all `tickets.service` cases PASS; typecheck exits 0. Root lint and format clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): ticket updates, nullable assignment, and governed status transitions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Tickets controller, module wiring, and endpoint tests (TDD)

**Files:**

- Create: `apps/api/src/tickets/tickets.controller.ts`, `apps/api/src/tickets/tickets.module.ts`, `apps/api/test/tickets.spec.ts`
- Modify: `apps/api/src/app.module.ts` (register `TicketsModule`)

**Interfaces:**

- Consumes: `JwtAuthGuard`, `CurrentOrg` from `@supportops/auth`; `PageQueryDto`/`Paginated`; `TicketsService`; the ticket DTOs.
- Produces: `GET /tickets`, `GET /tickets/:id`, `POST /tickets`, `PATCH /tickets/:id`, `PATCH /tickets/:id/assignment`, `PATCH /tickets/:id/status` — all behind `JwtAuthGuard`. `TicketsModule.register(config)` following the established module pattern. (Comment routes are added in Task 6; the controller gains its `TicketCommentsService` dependency there.)

- [ ] **Step 1: Write the controller**

`apps/api/src/tickets/tickets.controller.ts`:

```ts
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
import { CurrentOrg, JwtAuthGuard } from '@supportops/auth';
import { type Paginated } from '../common/pagination.js';
import { TicketsService } from './tickets.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { UpdateTicketDto } from './dto/update-ticket.dto.js';
import { AssignTicketDto } from './dto/assign-ticket.dto.js';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto.js';
import { ListTicketsDto } from './dto/list-tickets.dto.js';
import type { TicketDto } from './dto/ticket.dto.js';

@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

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
}
```

- [ ] **Step 2: Write the module and wire it in**

`apps/api/src/tickets/tickets.module.ts`:

```ts
import { Module, type DynamicModule } from '@nestjs/common';
import { AuthModule as AuthCoreModule } from '@supportops/auth';
import type { AppConfig } from '@supportops/config';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

@Module({})
export class TicketsModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: TicketsModule,
      imports: [AuthCoreModule.register({ secret: config.JWT_SECRET, expiresIn: '1h' })],
      controllers: [TicketsController],
      providers: [TicketsService],
    };
  }
}
```

In `apps/api/src/app.module.ts`, import `TicketsModule` and add `TicketsModule.register(config)` to the `imports` array (after `TeamsModule.register(config)`).

- [ ] **Step 3: Write the failing endpoint test**

`apps/api/test/tickets.spec.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { hashPassword } from '@supportops/auth';
import { prisma } from '@supportops/db';
import { buildTestApp } from './app.js';
import { resetDb } from './db.js';

let app: INestApplication;

beforeAll(async () => {
  ({ app } = await buildTestApp());
});
beforeEach(resetDb);
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function seedOrgWithAgent(slug: string): Promise<{
  orgId: string;
  token: string;
  customerId: string;
  agentId: string;
}> {
  const org = await prisma.organization.create({ data: { name: slug, slug, timezone: 'UTC' } });
  const agent = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `agent@${slug}.test`,
      name: 'Agent',
      role: 'AGENT',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const customer = await prisma.customer.create({
    data: { orgId: org.id, email: `cust@${slug}.test`, name: 'Cust' },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ orgSlug: slug, email: `agent@${slug}.test`, password: 's3cret-password' });
  return {
    orgId: org.id,
    token: res.body.accessToken as string,
    customerId: customer.id,
    agentId: agent.id,
  };
}

async function createTicket(token: string, customerId: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({ customerId, subject: 'Help', description: 'Please help' });
  return res.body.id as string;
}

describe('/tickets', () => {
  it('creates and lists tickets in a page envelope', async () => {
    const { token, customerId } = await seedOrgWithAgent('acme');
    await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, subject: 'Help', description: 'Please help' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/tickets')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(res.body.data[0]).toMatchObject({ subject: 'Help', status: 'OPEN', priority: 'NORMAL' });
  });

  it('requires authentication', async () => {
    const res = await request(app.getHttpServer()).get('/tickets');
    expect(res.status).toBe(401);
  });

  it('cannot read another organization ticket (404, not 403)', async () => {
    const acme = await seedOrgWithAgent('acme');
    const other = await seedOrgWithAgent('other');
    const id = await createTicket(acme.token, acme.customerId);
    const res = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(404);
  });

  it('assigns, then transitions status through resolve to close', async () => {
    const { token, customerId, agentId } = await seedOrgWithAgent('acme');
    const id = await createTicket(token, customerId);

    await request(app.getHttpServer())
      .patch(`/tickets/${id}/assignment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assigneeId: agentId })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/tickets/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'RESOLVED' })
      .expect(200);

    const closed = await request(app.getHttpServer())
      .patch(`/tickets/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CLOSED' });
    expect(closed.status).toBe(200);
    expect(closed.body.closedAt).not.toBeNull();
  });

  it('rejects an illegal status transition with 409', async () => {
    const { token, customerId } = await seedOrgWithAgent('acme');
    const id = await createTicket(token, customerId);
    const res = await request(app.getHttpServer())
      .patch(`/tickets/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CLOSED' }); // OPEN → CLOSED is not allowed
    expect(res.status).toBe(409);
  });

  it('filters the list by status', async () => {
    const { token, customerId } = await seedOrgWithAgent('acme');
    const id = await createTicket(token, customerId);
    await createTicket(token, customerId);
    await request(app.getHttpServer())
      .patch(`/tickets/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PENDING' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/tickets?status=PENDING')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].status).toBe('PENDING');
  });
});
```

- [ ] **Step 4: Run to verify fail, then pass**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test
pnpm --filter @supportops/api typecheck
```

Expected: FAIL before Steps 1–2, then all PASS. Root lint and format clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): tickets controller with assignment and status routes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Ticket comment DTOs and `TicketCommentsService` (TDD)

**Files:**

- Create: `apps/api/src/tickets/dto/ticket-comment.dto.ts`, `apps/api/src/tickets/dto/create-ticket-comment.dto.ts`, `apps/api/src/tickets/ticket-comments.service.ts`, `apps/api/src/tickets/ticket-comments.service.spec.ts`

**Interfaces:**

- Consumes: `prisma`, `AuthorType` from `@supportops/db`; `NotFoundError`; `paginate`/`Paginated`/`PageQueryDto`.
- Produces:
  - `interface TicketCommentDto { id; ticketId; authorType: AuthorType; authorId; body; isInternal; createdAt: Date }` and `mapComment(row)`
  - `class CreateTicketCommentDto { body; authorType?; isInternal? }`
  - `TicketCommentsService.list(orgId, ticketId, query)`, `.create(orgId, ticketId, actorUserId, dto)` — both organization-scoped through the parent ticket.

- [ ] **Step 1: Write the DTOs**

`apps/api/src/tickets/dto/ticket-comment.dto.ts`:

```ts
import type { AuthorType } from '@supportops/db';

export interface TicketCommentDto {
  id: string;
  ticketId: string;
  authorType: AuthorType;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: Date;
}

export function mapComment(comment: {
  id: string;
  ticketId: string;
  authorType: AuthorType;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: Date;
}): TicketCommentDto {
  return {
    id: comment.id,
    ticketId: comment.ticketId,
    authorType: comment.authorType,
    authorId: comment.authorId,
    body: comment.body,
    isInternal: comment.isInternal,
    createdAt: comment.createdAt,
  };
}
```

`apps/api/src/tickets/dto/create-ticket-comment.dto.ts`:

```ts
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthorType } from '@supportops/db';

export class CreateTicketCommentDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsEnum(AuthorType)
  authorType?: AuthorType;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
```

- [ ] **Step 2: Write the failing service test**

`apps/api/src/tickets/ticket-comments.service.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import { TicketCommentsService } from './ticket-comments.service.js';
import { NotFoundError } from '../common/domain-errors.js';

const service = new TicketCommentsService();

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedTicket() {
  const org = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  const other = await prisma.organization.create({
    data: { name: 'Other', slug: 'other', timezone: 'UTC' },
  });
  const agent = await prisma.user.create({
    data: { orgId: org.id, email: 'a@acme.test', name: 'A', role: 'AGENT', passwordHash: 'x' },
  });
  const customer = await prisma.customer.create({
    data: { orgId: org.id, email: 'c@acme.test', name: 'C' },
  });
  const ticket = await prisma.ticket.create({
    data: { orgId: org.id, customerId: customer.id, subject: 'S', description: 'D' },
  });
  return { org, other, agent, customer, ticket };
}

describe('TicketCommentsService.create', () => {
  it('defaults to an agent-authored, public comment attributed to the caller', async () => {
    const { org, agent, ticket } = await seedTicket();
    const comment = await service.create(org.id, ticket.id, agent.id, { body: 'On it' });
    expect(comment).toMatchObject({
      ticketId: ticket.id,
      authorType: 'AGENT',
      authorId: agent.id,
      body: 'On it',
      isInternal: false,
    });
  });

  it('records a customer-authored comment against the ticket customer', async () => {
    const { org, agent, customer, ticket } = await seedTicket();
    const comment = await service.create(org.id, ticket.id, agent.id, {
      body: 'Customer called to say thanks',
      authorType: 'CUSTOMER',
    });
    expect(comment).toMatchObject({ authorType: 'CUSTOMER', authorId: customer.id });
  });

  it('honours the internal flag', async () => {
    const { org, agent, ticket } = await seedTicket();
    const comment = await service.create(org.id, ticket.id, agent.id, {
      body: 'Private note',
      isInternal: true,
    });
    expect(comment.isInternal).toBe(true);
  });

  it('does not comment on a ticket in another organization (404)', async () => {
    const { other, agent, ticket } = await seedTicket();
    await expect(
      service.create(other.id, ticket.id, agent.id, { body: 'nope' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('TicketCommentsService.list', () => {
  it('lists a ticket comments oldest-first in a page envelope', async () => {
    const { org, agent, ticket } = await seedTicket();
    await service.create(org.id, ticket.id, agent.id, { body: 'first' });
    await service.create(org.id, ticket.id, agent.id, { body: 'second' });
    const page = await service.list(org.id, ticket.id, { page: 1, pageSize: 10 });
    expect(page).toMatchObject({ page: 1, pageSize: 10, total: 2 });
    expect(page.data.map((c) => c.body)).toEqual(['first', 'second']);
  });

  it('does not list comments of a ticket in another organization (404)', async () => {
    const { other, ticket } = await seedTicket();
    await expect(
      service.list(other.id, ticket.id, { page: 1, pageSize: 10 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test -- ticket-comments.service
```

Expected: FAIL — `./ticket-comments.service.js` does not exist yet.

- [ ] **Step 4: Write the service**

`apps/api/src/tickets/ticket-comments.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { prisma, type AuthorType } from '@supportops/db';
import { NotFoundError } from '../common/domain-errors.js';
import { paginate, type Paginated, type PageQueryDto } from '../common/pagination.js';
import { mapComment, type TicketCommentDto } from './dto/ticket-comment.dto.js';
import type { CreateTicketCommentDto } from './dto/create-ticket-comment.dto.js';

@Injectable()
export class TicketCommentsService {
  async list(
    orgId: string,
    ticketId: string,
    query: PageQueryDto,
  ): Promise<Paginated<TicketCommentDto>> {
    await this.assertTicketInOrg(orgId, ticketId);
    const where = { ticketId };
    return paginate(query, {
      count: () => prisma.ticketComment.count({ where }),
      findMany: async ({ skip, take }) =>
        (
          await prisma.ticketComment.findMany({ where, skip, take, orderBy: { createdAt: 'asc' } })
        ).map((c) => mapComment(c)),
    });
  }

  async create(
    orgId: string,
    ticketId: string,
    actorUserId: string,
    dto: CreateTicketCommentDto,
  ): Promise<TicketCommentDto> {
    const ticket = await this.assertTicketInOrg(orgId, ticketId);
    const authorType: AuthorType = dto.authorType ?? 'AGENT';
    const authorId = authorType === 'CUSTOMER' ? ticket.customerId : actorUserId;
    const comment = await prisma.ticketComment.create({
      data: { ticketId, authorType, authorId, body: dto.body, isInternal: dto.isInternal ?? false },
    });
    return mapComment(comment);
  }

  private async assertTicketInOrg(orgId: string, ticketId: string) {
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, orgId } });
    if (!ticket) throw new NotFoundError('Ticket not found');
    return ticket;
  }
}
```

> `PageQueryDto` is imported as a value from `common/pagination.js` for the
> parameter type; it is already exported there (used by every list endpoint).

- [ ] **Step 5: Run to verify green**

```bash
pnpm --filter @supportops/api test -- ticket-comments.service
pnpm --filter @supportops/api typecheck
```

Expected: all `ticket-comments.service` cases PASS; typecheck exits 0. Root lint and format clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): ticket comments service with agent and on-behalf authorship

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Comment routes on the tickets controller + endpoint tests (TDD)

**Files:**

- Modify: `apps/api/src/tickets/tickets.controller.ts` (inject `TicketCommentsService`, add two routes), `apps/api/src/tickets/tickets.module.ts` (add `TicketCommentsService` provider), `apps/api/test/tickets.spec.ts` (add comment cases)

**Interfaces:**

- Consumes: `CurrentUser`/`AuthPrincipal` from `@supportops/auth`; `TicketCommentsService`; `PageQueryDto`; `CreateTicketCommentDto`.
- Produces: `GET /tickets/:id/comments`, `POST /tickets/:id/comments` — behind `JwtAuthGuard`; the POST attributes an `AGENT` comment to the caller.

- [ ] **Step 1: Write the failing endpoint cases**

Append to `apps/api/test/tickets.spec.ts` (reusing the `seedOrgWithAgent`/`createTicket` helpers already in the file):

```ts
describe('/tickets/:id/comments', () => {
  it('adds an agent comment attributed to the caller and lists it', async () => {
    const { token, customerId, agentId } = await seedOrgWithAgent('acme');
    const id = await createTicket(token, customerId);

    const created = await request(app.getHttpServer())
      .post(`/tickets/${id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Looking into it' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      authorType: 'AGENT',
      authorId: agentId,
      isInternal: false,
    });

    const list = await request(app.getHttpServer())
      .get(`/tickets/${id}/comments`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 1 });
    expect(list.body.data[0].body).toBe('Looking into it');
  });

  it('records a customer-authored comment against the ticket customer', async () => {
    const { token, customerId } = await seedOrgWithAgent('acme');
    const id = await createTicket(token, customerId);
    const res = await request(app.getHttpServer())
      .post(`/tickets/${id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Forwarded from customer email', authorType: 'CUSTOMER' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ authorType: 'CUSTOMER', authorId: customerId });
  });

  it('cannot comment on another organization ticket (404)', async () => {
    const acme = await seedOrgWithAgent('acme');
    const other = await seedOrgWithAgent('other');
    const id = await createTicket(acme.token, acme.customerId);
    const res = await request(app.getHttpServer())
      .post(`/tickets/${id}/comments`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ body: 'peeking' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test -- tickets.spec
```

Expected: FAIL — the comment routes return 404 (not yet defined) rather than the expected statuses.

- [ ] **Step 3: Add the routes and provider**

In `apps/api/src/tickets/tickets.controller.ts`, extend the imports:

```ts
import { CurrentOrg, CurrentUser, JwtAuthGuard, type AuthPrincipal } from '@supportops/auth';
import { PageQueryDto, type Paginated } from '../common/pagination.js';
import { TicketCommentsService } from './ticket-comments.service.js';
import { CreateTicketCommentDto } from './dto/create-ticket-comment.dto.js';
import type { TicketCommentDto } from './dto/ticket-comment.dto.js';
```

Inject the comments service alongside the tickets service:

```ts
  constructor(
    private readonly tickets: TicketsService,
    private readonly comments: TicketCommentsService,
  ) {}
```

Add the two routes (place them after `setStatus`):

```ts
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
```

In `apps/api/src/tickets/tickets.module.ts`, import `TicketCommentsService` and add it to `providers`:

```ts
import { TicketCommentsService } from './ticket-comments.service.js';
// ...
      providers: [TicketsService, TicketCommentsService],
```

- [ ] **Step 4: Run to verify green (full suite)**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test
pnpm --filter @supportops/api typecheck
pnpm exec eslint .
pnpm exec prettier --check .
```

Expected: the whole API suite PASSES; typecheck, lint, and format are clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): ticket comment endpoints on the tickets controller

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Refresh the architecture doc and open the PR

**Files:**

- Modify: `docs/architecture.md` (add the tickets surface to the request-flow / module inventory, matching the existing prose style)

**Interfaces:**

- Consumes: nothing.
- Produces: documentation parity with the shipped surface; the Phase-5 pull request.

- [ ] **Step 1: Update `docs/architecture.md`**

Read the current `docs/architecture.md` and add the `tickets` module to wherever the existing modules (`organizations`, `users`, `teams`, `customers`) are enumerated, in the same voice. Describe: ticket CRUD + filtered listing, assignment (agent/team), the governed status lifecycle (`OPEN`/`PENDING`/`RESOLVED`/`CLOSED` with `closedAt`), and nested comments (`authorType` AGENT/CUSTOMER, `isInternal`). Do not restate the ADRs — link to `0011`/`0012`.

- [ ] **Step 2: Verify formatting and commit**

```bash
cd /home/victor/Documents/coding/supportops
pnpm exec prettier --check "docs/**/*.md"
git add -A
git commit -m "docs: document the tickets and comments surface

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin HEAD
gh pr create --base develop \
  --title "feat: tickets and comments surface" \
  --body "Adds the tickets HTTP surface: CRUD + filtered listing, assignment to an agent and/or team, a governed status lifecycle (OPEN/PENDING/RESOLVED/CLOSED with closedAt), and threaded comments (agent- and customer-attributed, with internal notes). Decisions recorded in ADRs 0011 and 0012. All service methods have unit tests against a real Postgres and every endpoint has an integration test."
```

Expected: CI (typecheck, lint, test, migrate-check) goes green on the PR.

---

## Notes for the executor

- Run `docker compose up -d postgres` once per session before the DB-backed tests; the API suite runs its spec files serially against a dedicated `supportops_api_test` database (see `apps/api/vitest.config.ts`).
- No Prisma migration is needed: the `tickets` and `ticket_comments` tables already exist in the schema from an earlier phase; this phase only adds application code.
- Keep every commit green (tests + `pnpm exec eslint .` + `pnpm exec prettier --check .`). Prefer `pnpm exec prettier --write .` before committing if formatting drifts.
- Work on a feature branch off `develop` (e.g. `feat/tickets-and-comments`); do not commit to `develop` directly.
