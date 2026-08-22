# Phase 4 — Domain management (`organizations`, `users`, `teams`, `customers`)

> Executed task by task. Each task is a small, independently testable slice that ends green — tests, lint, and typecheck all passing — before the next begins. Steps use checkboxes (`- [ ]`) for tracking.

**Goal:** Build the domain-management HTTP surface on top of the auth foundation — CRUD for `users`, `teams`, and `customers`, plus read/update of the caller's own `organization` — with role-based authorization, organization isolation, and a shared page-based list convention every future list reuses.

**Architecture:** Four NestJS feature modules under `apps/api/src/`, each the established `Controller → Service → Prisma` shape with `class-validator` input DTOs and explicit interface output DTOs mapped in the service. `@Roles(...)` on controllers gates which roles reach an endpoint; every conditional rule (organization scoping on each query, privilege-escalation limits, "own team" confinement, last-owner protection) lives in the service beside the query it constrains. A shared `common/pagination.ts` provides the list envelope, and three new typed domain errors extend the existing exception filter.

**Tech Stack:** NestJS 10 (`@nestjs/common`, `@nestjs/core`, `@nestjs/jwt`), `@node-rs/argon2` (via `@supportops/auth`), `class-validator` + `class-transformer`, Prisma 5 / PostgreSQL 16, Vitest 2 with `unplugin-swc`, `supertest`, TypeScript 5.5.

**Spec:** none in this repository — the requirements are captured in the ADRs written in Task 1 (`docs/adr/0009`, `docs/adr/0010`) and in the existing `docs/architecture.md`.

## Global Constraints

- **RBAC-always.** Every route sits behind `JwtAuthGuard`; role-restricted routes add `RolesGuard` + `@Roles(...)`. Guards are declared in the order `@UseGuards(JwtAuthGuard, RolesGuard)` so the principal is attached before roles are checked. No new auth path is invented — everything reuses `@supportops/auth`.
- **Prisma stays in services.** Only `*.service.ts` touches the `@supportops/db` client. Controllers, guards, and DTOs never do.
- **Responses are DTOs.** Endpoints return explicit interface DTO shapes mapped in the service. `passwordHash` and other internal fields are never serialized.
- **Organization isolation on every query.** Every read and write is scoped by the caller's `orgId` (from `@CurrentOrg()` / the token claims). A lookup for another organization's row finds nothing and yields **404, never 403** — existence in another tenant is never revealed.
- **Privilege-escalation guards.** Only an `OWNER` may create an `OWNER`, grant the `OWNER` role, or change a user who is currently an `OWNER`. The final `OWNER` of an organization can never be demoted or deleted.
- **Lists are page-based envelopes.** List endpoints accept `?page=&pageSize=&q=` (`pageSize` capped at 100) and return `{ data, page, pageSize, total }` via the shared `paginate()` helper.
- **Passwords are argon2id.** New passwords are hashed with `@supportops/auth` (`hashPassword`); plaintext is never stored or logged. The initial password is supplied on user creation.
- **Time is UTC.** Timestamps remain `timestamptz` in UTC (unchanged from Phase 2).
- **Tests are non-optional.** Every service method has a co-located unit test against a real Postgres; every endpoint has an integration test with `supertest`.
- Node `>=20` (local and CI run Node 24); pnpm only (9.7.0); commits carry `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; work lands on `develop` via a feature branch and PR.

---

### Task 1: Record the authorization and list decisions (ADRs 0009, 0010)

**Files:**

- Create: `docs/adr/0009-authorization-model.md`, `docs/adr/0010-list-pagination-convention.md`
- Modify: `docs/adr/README.md` (append two rows)

**Interfaces:**

- Consumes: nothing (documentation).
- Produces: the accepted decisions the rest of the phase implements — the role/authorization model with rule placement and the admin-set initial password (0009); the page-based list envelope (0010).

- [ ] **Step 1: Write ADR 0009**

`docs/adr/0009-authorization-model.md`:

```markdown
# 0009 — Authorization model and rule placement

- **Status:** Accepted
- **Date:** 2026-08-22

## Context

The management endpoints (organizations, users, teams, customers) must enforce
who may do what. Roles are `OWNER`, `ADMIN`, `TEAM_LEAD`, `AGENT`. Some rules are
coarse ("only owners and admins may create users"); others are conditional and
depend on the data ("a team lead may only manage their own team", "the last owner
cannot be removed"). We need one predictable, testable place for each kind.

## Decision

- **Coarse gating lives on controllers.** `@Roles(...)` plus `RolesGuard`
  declares which roles may reach an endpoint. Reads are open to all authenticated
  roles; structural mutations are `OWNER`/`ADMIN`; customer records are writable by
  every role; team membership is additionally reachable by `TEAM_LEAD`.
- **Conditional rules live in services**, beside the query they constrain:
  organization scoping on every query, privilege-escalation limits, "own team"
  confinement, uniqueness, and last-owner protection. Each becomes a plain service
  unit test. We deliberately do not add a declarative policy/ability layer: the
  rule set is small and concrete, and keeping each rule next to its query is the
  simplest thing that is fully testable.
- **The permission matrix:**

  | Endpoint                                     | OWNER | ADMIN | TEAM_LEAD     | AGENT |
  | -------------------------------------------- | ----- | ----- | ------------- | ----- |
  | `GET /orgs/me`                               | yes   | yes   | yes           | yes   |
  | `PATCH /orgs/me`                             | yes   | yes   | –             | –     |
  | `GET /users`, `GET /users/:id`               | yes   | yes   | yes           | yes   |
  | `POST/PATCH/DELETE /users`, `/role`, `/team` | yes   | yes   | –             | –     |
  | `GET /teams`, `GET /teams/:id`               | yes   | yes   | yes           | yes   |
  | `POST/DELETE /teams`, `PATCH` name/lead      | yes   | yes   | –             | –     |
  | `PATCH /teams/:id/members`                   | yes   | yes   | own team only | –     |
  | `GET/POST/PATCH/DELETE /customers`           | yes   | yes   | yes           | yes   |
  | `PATCH /users/me`, `/users/me/password`      | yes   | yes   | yes           | yes   |

- **Escalation guards:** only an `OWNER` may create an `OWNER`, grant the `OWNER`
  role, or change a user who is currently an `OWNER`; the last `OWNER` of an
  organization can never be demoted or deleted; a user cannot delete themselves.
- **Cross-tenant access returns 404, not 403.** An organization-scoped query for
  another tenant's row simply finds nothing, so existence elsewhere is never
  revealed.
- **Initial passwords are set by the creating administrator.** The create-user
  request carries a validated initial password, hashed with argon2id; the user can
  change it through self-service (`PATCH /users/me/password`). There is no email
  invitation flow at this time; should one become a real need, that is a future,
  separately recorded decision.

## Consequences

- A new endpoint's coarse access is one decorator, visible in review; its
  conditional rules are service unit tests.
- The organization slug is the tenant identity used at login, so it is immutable
  via `PATCH /orgs/me` (name and timezone are editable).
- An administrator briefly knows a user's initial password; a forced-change flag
  can tighten this later without changing the surface.
```

- [ ] **Step 2: Write ADR 0010**

`docs/adr/0010-list-pagination-convention.md`:

```markdown
# 0010 — List and pagination convention

- **Status:** Accepted
- **Date:** 2026-08-22

## Context

Every collection endpoint needs a consistent, predictable way to page and filter.
Choosing one shape now and reusing it everywhere keeps clients uniform and tests
simple as more collections appear.

## Decision

- **Offset pagination with a fixed envelope.** List endpoints accept
  `?page=` (default 1) and `?pageSize=` (default 20, capped at 100), plus an
  optional `?q=` free-text filter, and respond with
  `{ data, page, pageSize, total }`.
- **A single shared helper** (`common/pagination.ts`) owns the `PageQueryDto`
  (validated, coerced query params), the `Paginated<T>` shape, and a `paginate()`
  function that turns a `count` + `findMany({ skip, take })` pair into the
  envelope. Every list reuses it.

## Consequences

- Clients can jump to any page and always read `total`; the shape is trivial to
  assert in tests.
- Offset paging is adequate for the data volumes here. If a very large, rapidly
  changing collection later needs stable cursoring, that is a separate decision
  layered onto the same endpoints.
```

- [ ] **Step 3: Append the two rows to the ADR index**

In `docs/adr/README.md`, add after the `0008` row:

```markdown
| 0009 | Authorization model and rule placement | Accepted |
| 0010 | List and pagination convention | Accepted |
```

- [ ] **Step 4: Verify formatting and commit**

```bash
cd /home/victor/Documents/coding/supportops
pnpm exec prettier --check "docs/**/*.md"
```

Expected: the new files are reported as formatted (run `pnpm exec prettier --write "docs/**/*.md"` if not, then re-check).

```bash
git add -A
git commit -m "docs(adr): record authorization model and list conventions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Harden `@supportops/auth` guards and make them global (TDD)

**Files:**

- Modify: `packages/auth/src/jwt-auth.guard.ts` (case-insensitive `Bearer`, claim-shape check), `packages/auth/src/auth.module.ts` (register globally)
- Test: `packages/auth/src/guards.spec.ts` (add cases)

**Interfaces:**

- Consumes: `JwtService` from `@nestjs/jwt`; the existing guards and decorators.
- Produces: a `JwtAuthGuard` that matches the `Bearer` scheme case-insensitively and rejects tokens whose claims are not all strings; an `AuthModule.register(...)` whose exports (`JwtAuthGuard`, `RolesGuard`, `JwtModule`) are available application-wide, so feature modules can use the guards without re-importing.

- [ ] **Step 1: Add the failing guard cases**

Append to `packages/auth/src/guards.spec.ts` inside the existing `describe('JwtAuthGuard', ...)` block:

```ts
it('accepts a lower-case bearer scheme', async () => {
  const token = await jwt.signAsync({ sub: 'u1', org: 'o1', role: 'AGENT' });
  const request: { headers: Record<string, string>; principal?: AuthPrincipal } = {
    headers: { authorization: `bearer ${token}` },
  };
  await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  expect(request.principal).toEqual({ userId: 'u1', orgId: 'o1', role: 'AGENT' });
});

it('rejects a token whose claims are not all strings', async () => {
  const token = await jwt.signAsync({ sub: 'u1', org: 1, role: 'AGENT' });
  await expect(
    guard.canActivate(contextFor({ headers: { authorization: `Bearer ${token}` } })),
  ).rejects.toBeInstanceOf(UnauthorizedException);
});
```

And add a no-principal case inside the existing `describe('RolesGuard', ...)` block:

```ts
it('forbids when a role is required but no principal is present', () => {
  expect(() => guard.canActivate(contextFor({ principal: undefined }, adminHandler))).toThrow(
    ForbiddenException,
  );
});
```

- [ ] **Step 2: Run to verify the new cases fail**

```bash
cd /home/victor/Documents/coding/supportops
pnpm --filter @supportops/auth test
```

Expected: FAIL — lower-case scheme is rejected and the non-string-claims token is currently accepted.

- [ ] **Step 3: Harden `JwtAuthGuard`**

Replace the header parsing and claim handling in `packages/auth/src/jwt-auth.guard.ts` so the body of `canActivate` reads:

```ts
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; principal?: AuthPrincipal }>();
    const match = request.headers['authorization']?.match(/^Bearer (.+)$/i);
    if (!match) {
      throw new UnauthorizedException('Missing bearer token');
    }
    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(match[1]);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    if (
      typeof claims.sub !== 'string' ||
      typeof claims.org !== 'string' ||
      typeof claims.role !== 'string'
    ) {
      throw new UnauthorizedException('Invalid token');
    }
    request.principal = { userId: claims.sub, orgId: claims.org, role: claims.role };
    return true;
  }
```

- [ ] **Step 4: Register the auth module globally**

In `packages/auth/src/auth.module.ts`, add `global: true` to the returned `DynamicModule` so its exports are available app-wide:

```ts
return {
  module: AuthModule,
  global: true,
  imports: [
    JwtModule.register({
      secret: options.secret,
      signOptions: { expiresIn: options.expiresIn },
    }),
  ],
  providers: [JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, JwtModule],
};
```

- [ ] **Step 5: Run to verify green**

```bash
pnpm --filter @supportops/auth test
pnpm --filter @supportops/auth typecheck
```

Expected: all guard cases PASS; typecheck exits 0. Root `pnpm exec eslint .` and `pnpm exec prettier --check .` are clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): case-insensitive bearer, claim-shape check, global guards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `apps/api` shared foundation — pagination, domain errors, filter arms (TDD)

**Files:**

- Create: `apps/api/src/common/pagination.ts`, `apps/api/src/common/pagination.spec.ts`, `apps/api/src/common/domain-exception.filter.spec.ts`
- Modify: `apps/api/src/common/domain-errors.ts` (add three errors), `apps/api/src/common/domain-exception.filter.ts` (add three arms), `apps/api/vitest.config.ts` (refresh stale comment), `apps/api/test/auth-login.spec.ts` (decode claims), `apps/api/test/auth-me.spec.ts` (cross-org isolation)

**Interfaces:**

- Consumes: `class-validator`, `class-transformer`; the existing filter and errors; `JwtService` and `hashPassword` in the auth-me test.
- Produces:
  - `class PageQueryDto { page: number; pageSize: number; q?: string }`
  - `interface Paginated<T> { data: T[]; page: number; pageSize: number; total: number }`
  - `paginate<T>(query, { count, findMany }): Promise<Paginated<T>>`
  - `class NotFoundError`, `class ConflictError`, `class ForbiddenActionError` (each `extends DomainError`)
  - filter mappings: `NotFoundError → 404`, `ConflictError → 409`, `ForbiddenActionError → 403`

- [ ] **Step 1: Write the failing pagination test**

`apps/api/src/common/pagination.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { paginate } from './pagination.js';

describe('paginate', () => {
  it('returns the requested slice with envelope metadata', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const result = await paginate(
      { page: 2, pageSize: 2 },
      {
        count: async () => rows.length,
        findMany: async ({ skip, take }) => rows.slice(skip, skip + take),
      },
    );
    expect(result).toEqual({ data: [{ id: 2 }, { id: 3 }], page: 2, pageSize: 2, total: 5 });
  });

  it('reports the total independently of the returned page size', async () => {
    const result = await paginate(
      { page: 1, pageSize: 10 },
      { count: async () => 42, findMany: async () => [] },
    );
    expect(result.total).toBe(42);
    expect(result.data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /home/victor/Documents/coding/supportops
pnpm --filter @supportops/api test -- pagination
```

Expected: FAIL — `./pagination.js` does not exist yet.

- [ ] **Step 3: Write the pagination helper**

`apps/api/src/common/pagination.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Standard query parameters for a paged list. Extend per resource if extra filters are needed. */
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsString()
  q?: string;
}

/** The envelope every list endpoint returns. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Turn a count + windowed findMany into a Paginated envelope. */
export async function paginate<T>(
  query: { page: number; pageSize: number },
  source: {
    count: () => Promise<number>;
    findMany: (args: { skip: number; take: number }) => Promise<T[]>;
  },
): Promise<Paginated<T>> {
  const { page, pageSize } = query;
  const [total, data] = await Promise.all([
    source.count(),
    source.findMany({ skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { data, page, pageSize, total };
}
```

- [ ] **Step 4: Add the three domain errors**

Append to `apps/api/src/common/domain-errors.ts`:

```ts
/** A requested resource does not exist in the caller's organization. Maps to 404. */
export class NotFoundError extends DomainError {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** A uniqueness constraint would be violated. Maps to 409. */
export class ConflictError extends DomainError {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

/** The caller is not permitted to perform this specific action on this data. Maps to 403. */
export class ForbiddenActionError extends DomainError {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenActionError';
  }
}
```

- [ ] **Step 5: Add the filter arms**

In `apps/api/src/common/domain-exception.filter.ts`, extend the imports and add three arms **before** the generic `DomainError` arm:

```ts
import {
  DomainError,
  InvalidCredentialsError,
  NotFoundError,
  ConflictError,
  ForbiddenActionError,
} from './domain-errors.js';
```

```ts
if (exception instanceof NotFoundError) {
  response.status(404).json({ statusCode: 404, message: exception.message });
  return;
}
if (exception instanceof ConflictError) {
  response.status(409).json({ statusCode: 409, message: exception.message });
  return;
}
if (exception instanceof ForbiddenActionError) {
  response.status(403).json({ statusCode: 403, message: exception.message });
  return;
}
```

- [ ] **Step 6: Write the filter unit test**

`apps/api/src/common/domain-exception.filter.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenActionError,
  InvalidCredentialsError,
} from './domain-errors.js';

function hostFor() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  return { res, host };
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it.each([
    [new NotFoundError('nope'), 404],
    [new ConflictError('dup'), 409],
    [new ForbiddenActionError('no'), 403],
    [new InvalidCredentialsError(), 401],
  ])('maps %s to status %i', (error, status) => {
    const { res, host } = hostFor();
    filter.catch(error, host);
    expect(res.status).toHaveBeenCalledWith(status);
  });

  it('maps an unknown error to 500 without leaking its message', () => {
    const { res, host } = hostFor();
    filter.catch(new Error('boom'), host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error' });
  });
});
```

- [ ] **Step 7: Refresh the stale vitest comment and add the two auth-test follow-ups**

In `apps/api/vitest.config.ts`, replace the `// Integration tests share one database; run files serially.` comment with:

```ts
// This suite's spec files share one database, so run them serially to avoid cross-file interference.
```

In `apps/api/test/auth-login.spec.ts`, decode the token in the happy-path case. Add the import:

```ts
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims } from '@supportops/auth';
```

and extend the "returns an access token for valid credentials" test to assert the claims:

```ts
const jwt = new JwtService({ secret: 'test-secret-at-least-16-chars' });
const claims = await jwt.verifyAsync<AccessTokenClaims>(res.body.accessToken);
expect(claims.org).toBeTypeOf('string');
expect(claims.role).toBe('AGENT');
```

In `apps/api/test/auth-me.spec.ts`, add a cross-organization isolation case (a token whose `sub` and `org` belong to different organizations must not resolve a user). Add the imports:

```ts
import { JwtService } from '@nestjs/jwt';
```

and the test inside the `describe('GET /auth/me', ...)` block:

```ts
it('returns 401 when the token org does not match the user', async () => {
  const orgA = await prisma.organization.create({
    data: { name: 'A', slug: 'a-org', timezone: 'UTC' },
  });
  const orgB = await prisma.organization.create({
    data: { name: 'B', slug: 'b-org', timezone: 'UTC' },
  });
  const user = await prisma.user.create({
    data: {
      orgId: orgA.id,
      email: 'ada@a.test',
      name: 'Ada',
      role: 'AGENT',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const jwt = new JwtService({ secret: 'test-secret-at-least-16-chars' });
  const token = await jwt.signAsync({ sub: user.id, org: orgB.id, role: 'AGENT' });
  const res = await request(app.getHttpServer())
    .get('/auth/me')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(401);
});
```

- [ ] **Step 8: Run to verify green**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test
pnpm --filter @supportops/api typecheck
```

Expected: pagination and filter unit tests PASS; the extended auth tests PASS; typecheck exits 0. Root `pnpm exec eslint .` and `pnpm exec prettier --check .` are clean.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(api): shared pagination helper and 404/409/403 domain errors

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `organizations` module — read/update own organization (TDD)

**Files:**

- Create: `apps/api/src/organizations/dto/organization.dto.ts`, `apps/api/src/organizations/dto/update-organization.dto.ts`, `apps/api/src/organizations/organizations.service.ts`, `apps/api/src/organizations/organizations.service.spec.ts`, `apps/api/src/organizations/organizations.controller.ts`, `apps/api/src/organizations/organizations.module.ts`
- Modify: `apps/api/src/app.module.ts` (import the module)
- Test: `apps/api/test/organizations.spec.ts`

**Interfaces:**

- Consumes: `JwtAuthGuard`, `RolesGuard`, `Roles`, `CurrentOrg` from `@supportops/auth`; `prisma` from `@supportops/db`; `NotFoundError` from `common/domain-errors`.
- Produces:
  - `interface OrganizationDto { id: string; name: string; slug: string; timezone: string }`
  - `class UpdateOrganizationDto { name?: string; timezone?: string }`
  - `OrganizationsService.getOwn(orgId): Promise<OrganizationDto>` and `updateOwn(orgId, dto): Promise<OrganizationDto>`
  - `GET /orgs/me` (all roles) and `PATCH /orgs/me` (`OWNER`/`ADMIN`)

- [ ] **Step 1: Write the DTOs**

`apps/api/src/organizations/dto/organization.dto.ts`:

```ts
export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}
```

`apps/api/src/organizations/dto/update-organization.dto.ts` (slug is intentionally not editable):

```ts
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  timezone?: string;
}
```

- [ ] **Step 2: Write the failing service test**

`apps/api/src/organizations/organizations.service.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import { OrganizationsService } from './organizations.service.js';
import { NotFoundError } from '../common/domain-errors.js';

const service = new OrganizationsService();

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedOrg() {
  return prisma.organization.create({ data: { name: 'Acme', slug: 'acme', timezone: 'UTC' } });
}

describe('OrganizationsService', () => {
  it('returns the caller organization', async () => {
    const org = await seedOrg();
    expect(await service.getOwn(org.id)).toEqual({
      id: org.id,
      name: 'Acme',
      slug: 'acme',
      timezone: 'UTC',
    });
  });

  it('updates name and timezone but never the slug', async () => {
    const org = await seedOrg();
    const updated = await service.updateOwn(org.id, { name: 'Acme Inc', timezone: 'Europe/Paris' });
    expect(updated).toEqual({
      id: org.id,
      name: 'Acme Inc',
      slug: 'acme',
      timezone: 'Europe/Paris',
    });
  });

  it('throws NotFoundError for an unknown organization', async () => {
    await expect(service.getOwn('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
```

- [ ] **Step 3: Write the service**

`apps/api/src/organizations/organizations.service.ts`:

```ts
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
```

- [ ] **Step 4: Write the controller and module**

`apps/api/src/organizations/organizations.controller.ts`:

```ts
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
```

`apps/api/src/organizations/organizations.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({ controllers: [OrganizationsController], providers: [OrganizationsService] })
export class OrganizationsModule {}
```

- [ ] **Step 5: Wire the module into the app**

In `apps/api/src/app.module.ts`, import `OrganizationsModule` and add it to `imports`:

```ts
import { OrganizationsModule } from './organizations/organizations.module.js';
// ...
      imports: [HealthModule, AuthModule.register(config), OrganizationsModule],
```

- [ ] **Step 6: Write the failing endpoint test**

`apps/api/test/organizations.spec.ts`:

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

async function seedAndLogin(role: 'OWNER' | 'AGENT'): Promise<string> {
  const org = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  await prisma.user.create({
    data: {
      orgId: org.id,
      email: `${role}@acme.test`,
      name: role,
      role,
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ orgSlug: 'acme', email: `${role}@acme.test`, password: 's3cret-password' });
  return res.body.accessToken as string;
}

describe('/orgs/me', () => {
  it('returns the caller organization for any authenticated role', async () => {
    const token = await seedAndLogin('AGENT');
    const res = await request(app.getHttpServer())
      .get('/orgs/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('acme');
  });

  it('lets an owner update name and timezone', async () => {
    const token = await seedAndLogin('OWNER');
    const res = await request(app.getHttpServer())
      .patch('/orgs/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Inc' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Acme Inc');
  });

  it('forbids an agent from updating the organization', async () => {
    const token = await seedAndLogin('AGENT');
    const res = await request(app.getHttpServer())
      .patch('/orgs/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('rejects an attempt to change the slug', async () => {
    const token = await seedAndLogin('OWNER');
    const res = await request(app.getHttpServer())
      .patch('/orgs/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'hacked' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 7: Run to verify fail, then pass**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test
pnpm --filter @supportops/api typecheck
```

Expected: FAIL before Steps 1–5, then all PASS (the slug case is rejected by `forbidNonWhitelisted`). Root lint and format clean.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): read and update the caller's own organization

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `customers` module — full CRUD with paged list (TDD)

**Files:**

- Create: `apps/api/src/customers/dto/customer.dto.ts`, `apps/api/src/customers/dto/create-customer.dto.ts`, `apps/api/src/customers/dto/update-customer.dto.ts`, `apps/api/src/customers/customers.service.ts`, `apps/api/src/customers/customers.service.spec.ts`, `apps/api/src/customers/customers.controller.ts`, `apps/api/src/customers/customers.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/customers.spec.ts`

**Interfaces:**

- Consumes: `JwtAuthGuard`, `CurrentOrg` from `@supportops/auth`; `prisma`; `PageQueryDto`/`Paginated`/`paginate` from `common/pagination`; `NotFoundError`/`ConflictError`.
- Produces:
  - `interface CustomerDto { id: string; email: string; name: string }`
  - `class CreateCustomerDto { email: string; name: string }`, `class UpdateCustomerDto { email?: string; name?: string }`
  - `CustomersService` with `list`, `get`, `create`, `update`, `remove` (all org-scoped)
  - `GET/POST/PATCH/DELETE /customers` (all authenticated roles)

- [ ] **Step 1: Write the DTOs**

`apps/api/src/customers/dto/customer.dto.ts`:

```ts
export interface CustomerDto {
  id: string;
  email: string;
  name: string;
}
```

`apps/api/src/customers/dto/create-customer.dto.ts`:

```ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}
```

`apps/api/src/customers/dto/update-customer.dto.ts`:

```ts
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
```

- [ ] **Step 2: Write the failing service test**

`apps/api/src/customers/customers.service.spec.ts`:

```ts
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
```

- [ ] **Step 3: Write the service**

`apps/api/src/customers/customers.service.ts`:

```ts
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
```

- [ ] **Step 4: Write the controller and module**

`apps/api/src/customers/customers.controller.ts`:

```ts
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
import { CurrentOrg, JwtAuthGuard } from '@supportops/auth';
import { PageQueryDto, type Paginated } from '../common/pagination.js';
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import type { CustomerDto } from './dto/customer.dto.js';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@CurrentOrg() orgId: string, @Query() query: PageQueryDto): Promise<Paginated<CustomerDto>> {
    return this.customers.list(orgId, query);
  }

  @Get(':id')
  get(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string): Promise<CustomerDto> {
    return this.customers.get(orgId, id);
  }

  @Post()
  create(@CurrentOrg() orgId: string, @Body() dto: CreateCustomerDto): Promise<CustomerDto> {
    return this.customers.create(orgId, dto);
  }

  @Patch(':id')
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerDto> {
    return this.customers.update(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.customers.remove(orgId, id);
  }
}
```

`apps/api/src/customers/customers.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';

@Module({ controllers: [CustomersController], providers: [CustomersService] })
export class CustomersModule {}
```

Wire it in `apps/api/src/app.module.ts` (import and add `CustomersModule` to `imports`).

- [ ] **Step 5: Write the failing endpoint test**

`apps/api/test/customers.spec.ts`:

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

async function seedOrgWithAgent(slug: string): Promise<{ orgId: string; token: string }> {
  const org = await prisma.organization.create({
    data: { name: slug, slug, timezone: 'UTC' },
  });
  await prisma.user.create({
    data: {
      orgId: org.id,
      email: `agent@${slug}.test`,
      name: 'Agent',
      role: 'AGENT',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ orgSlug: slug, email: `agent@${slug}.test`, password: 's3cret-password' });
  return { orgId: org.id, token: res.body.accessToken as string };
}

describe('/customers', () => {
  it('creates and lists customers in a page envelope', async () => {
    const { token } = await seedOrgWithAgent('acme');
    await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'c1@x.test', name: 'C1' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(res.body.data[0].email).toBe('c1@x.test');
  });

  it('requires authentication', async () => {
    const res = await request(app.getHttpServer()).get('/customers');
    expect(res.status).toBe(401);
  });

  it('cannot read another organization customer (404, not 403)', async () => {
    const acme = await seedOrgWithAgent('acme');
    const other = await seedOrgWithAgent('other');
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${acme.token}`)
      .send({ email: 'mine@x.test', name: 'Mine' });
    const res = await request(app.getHttpServer())
      .get(`/customers/${created.body.id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(404);
  });

  it('rejects a duplicate email with 409', async () => {
    const { token } = await seedOrgWithAgent('acme');
    await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'dup@x.test', name: 'One' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'dup@x.test', name: 'Two' });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 6: Run to verify fail, then pass**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test
pnpm --filter @supportops/api typecheck
```

Expected: FAIL before Steps 1–4, then all PASS. Root lint and format clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): customers CRUD with organization-scoped paged listing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `users` module — CRUD, paged list, and self-service (TDD)

**Files:**

- Create: `apps/api/src/users/dto/user.dto.ts`, `apps/api/src/users/dto/create-user.dto.ts`, `apps/api/src/users/dto/update-user.dto.ts`, `apps/api/src/users/dto/update-me.dto.ts`, `apps/api/src/users/dto/change-password.dto.ts`, `apps/api/src/users/users.service.ts`, `apps/api/src/users/users.service.spec.ts`, `apps/api/src/users/users.controller.ts`, `apps/api/src/users/users.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/users.spec.ts`

**Interfaces:**

- Consumes: `JwtAuthGuard`, `RolesGuard`, `Roles`, `CurrentOrg`, `CurrentUser`, `AuthPrincipal`, `hashPassword`, `verifyPassword` from `@supportops/auth`; `prisma`, `Role` from `@supportops/db`; pagination and errors from `common/`.
- Produces:
  - `interface UserDto { id: string; email: string; name: string; role: Role; teamId: string | null }`
  - `class CreateUserDto { email; name; role; password; teamId? }`, `class UpdateUserDto { name?; email? }`, `class UpdateMeDto { name }`, `class ChangePasswordDto { currentPassword; newPassword }`
  - `UsersService` with `list`, `get`, `create`, `updateProfile`, `remove`, `updateSelf`, `changePassword`
  - `GET /users`, `GET /users/:id` (all roles); `POST/PATCH/DELETE /users/:id` (`OWNER`/`ADMIN`); `PATCH /users/me`, `PATCH /users/me/password` (all roles)
  - `mapUser(user): UserDto` — the shared row→DTO mapper co-located in `dto/user.dto.ts`

- [ ] **Step 1: Write the DTOs**

`apps/api/src/users/dto/user.dto.ts`:

```ts
import type { Role } from '@supportops/db';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId: string | null;
}

/** Shared mapper so other modules (e.g. teams membership) return the same shape. */
export function mapUser(user: {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId: string | null;
}): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    teamId: user.teamId,
  };
}
```

`apps/api/src/users/dto/create-user.dto.ts`:

```ts
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Role } from '@supportops/db';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(Role)
  role!: Role;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}
```

`apps/api/src/users/dto/update-user.dto.ts`:

```ts
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
```

`apps/api/src/users/dto/update-me.dto.ts`:

```ts
import { IsString, MinLength } from 'class-validator';

export class UpdateMeDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
```

`apps/api/src/users/dto/change-password.dto.ts`:

```ts
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
```

> `Role` is imported as a value (`IsEnum(Role)`), which requires `@supportops/db` to
> re-export the Prisma `Role` enum as a runtime value. It already does (Phase 2).

- [ ] **Step 2: Write the failing service test**

`apps/api/src/users/users.service.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { verifyPassword } from '@supportops/auth';
import { prisma, type Role } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import { UsersService } from './users.service.js';
import { ConflictError, ForbiddenActionError, NotFoundError } from '../common/domain-errors.js';

const service = new UsersService();

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function org(slug = 'acme') {
  return prisma.organization.create({ data: { name: slug, slug, timezone: 'UTC' } });
}
async function user(orgId: string, email: string, role: Role) {
  return prisma.user.create({
    data: { orgId, email, name: email, role, passwordHash: 'x' },
  });
}

describe('UsersService.create', () => {
  it('hashes the initial password and returns a DTO without the hash', async () => {
    const acme = await org();
    const created = await service.create(acme.id, 'OWNER', {
      email: 'new@acme.test',
      name: 'New',
      role: 'AGENT',
      password: 'initial-password',
    });
    expect(created).not.toHaveProperty('passwordHash');
    const row = await prisma.user.findFirstOrThrow({ where: { id: created.id } });
    expect(await verifyPassword(row.passwordHash, 'initial-password')).toBe(true);
  });

  it('rejects a duplicate email within the organization', async () => {
    const acme = await org();
    await user(acme.id, 'dup@acme.test', 'AGENT');
    await expect(
      service.create(acme.id, 'OWNER', {
        email: 'dup@acme.test',
        name: 'Dup',
        role: 'AGENT',
        password: 'initial-password',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('forbids a non-owner from creating an owner', async () => {
    const acme = await org();
    await expect(
      service.create(acme.id, 'ADMIN', {
        email: 'owner2@acme.test',
        name: 'Owner2',
        role: 'OWNER',
        password: 'initial-password',
      }),
    ).rejects.toBeInstanceOf(ForbiddenActionError);
  });
});

describe('UsersService.remove', () => {
  it('forbids deleting the last owner', async () => {
    const acme = await org();
    const owner = await user(acme.id, 'owner@acme.test', 'OWNER');
    const admin = await user(acme.id, 'admin@acme.test', 'ADMIN');
    await expect(service.remove(acme.id, admin.id, owner.id)).rejects.toBeInstanceOf(
      ForbiddenActionError,
    );
  });

  it('forbids deleting a user who leads a team', async () => {
    const acme = await org();
    const owner = await user(acme.id, 'owner@acme.test', 'OWNER');
    const lead = await user(acme.id, 'lead@acme.test', 'TEAM_LEAD');
    await prisma.team.create({ data: { orgId: acme.id, name: 'Support', leadUserId: lead.id } });
    await expect(service.remove(acme.id, owner.id, lead.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('forbids deleting yourself', async () => {
    const acme = await org();
    const owner = await user(acme.id, 'owner@acme.test', 'OWNER');
    await expect(service.remove(acme.id, owner.id, owner.id)).rejects.toBeInstanceOf(
      ForbiddenActionError,
    );
  });

  it('deletes an ordinary user', async () => {
    const acme = await org();
    const owner = await user(acme.id, 'owner@acme.test', 'OWNER');
    const agent = await user(acme.id, 'agent@acme.test', 'AGENT');
    await service.remove(acme.id, owner.id, agent.id);
    expect(await prisma.user.findFirst({ where: { id: agent.id } })).toBeNull();
  });
});

describe('UsersService.changePassword', () => {
  it('requires the correct current password', async () => {
    const acme = await org();
    const created = await service.create(acme.id, 'OWNER', {
      email: 'u@acme.test',
      name: 'U',
      role: 'AGENT',
      password: 'initial-password',
    });
    await expect(
      service.changePassword(created.id, acme.id, 'wrong', 'brand-new-password'),
    ).rejects.toBeInstanceOf(ForbiddenActionError);
    await service.changePassword(created.id, acme.id, 'initial-password', 'brand-new-password');
    const row = await prisma.user.findFirstOrThrow({ where: { id: created.id } });
    expect(await verifyPassword(row.passwordHash, 'brand-new-password')).toBe(true);
  });
});

describe('UsersService cross-organization', () => {
  it('does not find a user from another organization', async () => {
    const acme = await org('acme');
    const other = await org('other');
    const u = await user(acme.id, 'a@acme.test', 'AGENT');
    await expect(service.get(other.id, u.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

- [ ] **Step 3: Write the service**

`apps/api/src/users/users.service.ts`:

```ts
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
```

- [ ] **Step 4: Write the controller and module**

`apps/api/src/users/users.controller.ts` (the `me` routes are declared before `:id` so they are matched first):

```ts
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
```

`apps/api/src/users/users.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({ controllers: [UsersController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
```

Wire it in `apps/api/src/app.module.ts` (import and add `UsersModule` to `imports`).

- [ ] **Step 5: Write the failing endpoint test**

`apps/api/test/users.spec.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { hashPassword } from '@supportops/auth';
import { prisma, type Role } from '@supportops/db';
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

async function seedAndLogin(role: Role, slug = 'acme'): Promise<{ orgId: string; token: string }> {
  const org = await prisma.organization.upsert({
    where: { slug },
    update: {},
    create: { name: slug, slug, timezone: 'UTC' },
  });
  await prisma.user.create({
    data: {
      orgId: org.id,
      email: `${role}@${slug}.test`,
      name: role,
      role,
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ orgSlug: slug, email: `${role}@${slug}.test`, password: 's3cret-password' });
  return { orgId: org.id, token: res.body.accessToken as string };
}

describe('/users', () => {
  it('lets an owner create a user who can then log in', async () => {
    const { token } = await seedAndLogin('OWNER');
    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'new@acme.test', name: 'New', role: 'AGENT', password: 'initial-password' });
    expect(created.status).toBe(201);
    expect(created.body.passwordHash).toBeUndefined();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ orgSlug: 'acme', email: 'new@acme.test', password: 'initial-password' });
    expect(login.status).toBe(200);
  });

  it('forbids an agent from creating a user (403)', async () => {
    const { token } = await seedAndLogin('AGENT');
    const res = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'x@acme.test', name: 'X', role: 'AGENT', password: 'initial-password' });
    expect(res.status).toBe(403);
  });

  it('lets a user change their own password', async () => {
    const { token } = await seedAndLogin('AGENT');
    const res = await request(app.getHttpServer())
      .patch('/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 's3cret-password', newPassword: 'a-new-password' });
    expect(res.status).toBe(204);
    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ orgSlug: 'acme', email: 'AGENT@acme.test', password: 'a-new-password' });
    expect(relogin.status).toBe(200);
  });
});
```

- [ ] **Step 6: Run to verify fail, then pass**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test
pnpm --filter @supportops/api typecheck
```

Expected: FAIL before Steps 1–4, then all PASS. Root lint and format clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): users CRUD, paged listing, and self-service password change

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: `users` — role change and team assignment (TDD)

**Files:**

- Create: `apps/api/src/users/dto/set-role.dto.ts`, `apps/api/src/users/dto/assign-team.dto.ts`
- Modify: `apps/api/src/users/users.service.ts` (add `setRole`, `assignTeam`), `apps/api/src/users/users.controller.ts` (add two routes)
- Test: `apps/api/src/users/users.service.spec.ts` (extend), `apps/api/test/users.spec.ts` (extend)

**Interfaces:**

- Consumes: the `UsersService` and DTOs from Task 6; `Role` from `@supportops/db`.
- Produces:
  - `class SetRoleDto { role: Role }`, `class AssignTeamDto { teamId: string | null }`
  - `UsersService.setRole(orgId, actorRole, targetId, newRole): Promise<UserDto>`
  - `UsersService.assignTeam(orgId, targetId, teamId: string | null): Promise<UserDto>`
  - `PATCH /users/:id/role` and `PATCH /users/:id/team` (`OWNER`/`ADMIN`)

- [ ] **Step 1: Write the DTOs**

`apps/api/src/users/dto/set-role.dto.ts`:

```ts
import { IsEnum } from 'class-validator';
import { Role } from '@supportops/db';

export class SetRoleDto {
  @IsEnum(Role)
  role!: Role;
}
```

`apps/api/src/users/dto/assign-team.dto.ts` (explicit `null` clears the team; a missing field is rejected):

```ts
import { IsUUID, ValidateIf } from 'class-validator';

export class AssignTeamDto {
  @ValidateIf((o: AssignTeamDto) => o.teamId !== null)
  @IsUUID()
  teamId!: string | null;
}
```

- [ ] **Step 2: Extend the service test (TDD)**

Append to `apps/api/src/users/users.service.spec.ts`:

```ts
describe('UsersService.setRole', () => {
  it('forbids a non-owner from granting the owner role', async () => {
    const acme = await org();
    const target = await user(acme.id, 'a@acme.test', 'AGENT');
    await expect(service.setRole(acme.id, 'ADMIN', target.id, 'OWNER')).rejects.toBeInstanceOf(
      ForbiddenActionError,
    );
  });

  it('forbids a non-owner from changing a current owner', async () => {
    const acme = await org();
    const owner2 = await user(acme.id, 'o2@acme.test', 'OWNER');
    await user(acme.id, 'o1@acme.test', 'OWNER'); // keep two owners
    await expect(service.setRole(acme.id, 'ADMIN', owner2.id, 'ADMIN')).rejects.toBeInstanceOf(
      ForbiddenActionError,
    );
  });

  it('forbids demoting the last owner', async () => {
    const acme = await org();
    const owner = await user(acme.id, 'owner@acme.test', 'OWNER');
    await expect(service.setRole(acme.id, 'OWNER', owner.id, 'ADMIN')).rejects.toBeInstanceOf(
      ForbiddenActionError,
    );
  });

  it('lets an admin change roles among non-owners', async () => {
    const acme = await org();
    const target = await user(acme.id, 'a@acme.test', 'AGENT');
    const updated = await service.setRole(acme.id, 'ADMIN', target.id, 'TEAM_LEAD');
    expect(updated.role).toBe('TEAM_LEAD');
  });
});

describe('UsersService.assignTeam', () => {
  it('assigns and clears a team', async () => {
    const acme = await org();
    const lead = await user(acme.id, 'lead@acme.test', 'TEAM_LEAD');
    const team = await prisma.team.create({
      data: { orgId: acme.id, name: 'Support', leadUserId: lead.id },
    });
    const member = await user(acme.id, 'm@acme.test', 'AGENT');
    expect((await service.assignTeam(acme.id, member.id, team.id)).teamId).toBe(team.id);
    expect((await service.assignTeam(acme.id, member.id, null)).teamId).toBeNull();
  });

  it('rejects a team from another organization', async () => {
    const acme = await org('acme');
    const other = await org('other');
    const otherLead = await user(other.id, 'lead@other.test', 'TEAM_LEAD');
    const otherTeam = await prisma.team.create({
      data: { orgId: other.id, name: 'T', leadUserId: otherLead.id },
    });
    const member = await user(acme.id, 'm@acme.test', 'AGENT');
    await expect(service.assignTeam(acme.id, member.id, otherTeam.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
```

- [ ] **Step 3: Add the service methods**

Append to the `UsersService` class in `apps/api/src/users/users.service.ts`:

```ts
  async setRole(
    orgId: string,
    actorRole: Role,
    targetId: string,
    newRole: Role,
  ): Promise<UserDto> {
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
```

- [ ] **Step 4: Add the controller routes**

Add the imports and two routes to `apps/api/src/users/users.controller.ts` (place them alongside the other `:id` routes):

```ts
import { SetRoleDto } from './dto/set-role.dto.js';
import { AssignTeamDto } from './dto/assign-team.dto.js';
```

```ts
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
```

- [ ] **Step 5: Extend the endpoint test (TDD)**

Append to `apps/api/test/users.spec.ts` inside `describe('/users', ...)`:

```ts
it('forbids an admin from granting the owner role (403)', async () => {
  const { token, orgId } = await seedAndLogin('ADMIN');
  const target = await prisma.user.create({
    data: {
      orgId,
      email: 'target@acme.test',
      name: 'Target',
      role: 'AGENT',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const res = await request(app.getHttpServer())
    .patch(`/users/${target.id}/role`)
    .set('Authorization', `Bearer ${token}`)
    .send({ role: 'OWNER' });
  expect(res.status).toBe(403);
});
```

- [ ] **Step 6: Run to verify fail, then pass**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test
pnpm --filter @supportops/api typecheck
```

Expected: the new cases FAIL before Steps 1–4, then all PASS. Root lint and format clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): user role changes and team assignment with escalation guards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: `teams` module — CRUD, paged list, and lead management (TDD)

**Files:**

- Create: `apps/api/src/teams/dto/team.dto.ts`, `apps/api/src/teams/dto/create-team.dto.ts`, `apps/api/src/teams/dto/update-team.dto.ts`, `apps/api/src/teams/dto/set-lead.dto.ts`, `apps/api/src/teams/teams.service.ts`, `apps/api/src/teams/teams.service.spec.ts`, `apps/api/src/teams/teams.controller.ts`, `apps/api/src/teams/teams.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/teams.spec.ts`

**Interfaces:**

- Consumes: `JwtAuthGuard`, `RolesGuard`, `Roles`, `CurrentOrg` from `@supportops/auth`; `prisma`; pagination and errors from `common/`.
- Produces:
  - `interface TeamDto { id: string; name: string; leadUserId: string }`
  - `class CreateTeamDto { name; leadUserId }`, `class UpdateTeamDto { name? }`, `class SetLeadDto { leadUserId }`
  - `TeamsService` with `list`, `get`, `create`, `rename`, `setLead`, `remove`
  - `GET /teams`, `GET /teams/:id` (all roles); `POST/DELETE /teams`, `PATCH /teams/:id`, `PATCH /teams/:id/lead` (`OWNER`/`ADMIN`)

- [ ] **Step 1: Write the DTOs**

`apps/api/src/teams/dto/team.dto.ts`:

```ts
export interface TeamDto {
  id: string;
  name: string;
  leadUserId: string;
}
```

`apps/api/src/teams/dto/create-team.dto.ts`:

```ts
import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsUUID()
  leadUserId!: string;
}
```

`apps/api/src/teams/dto/update-team.dto.ts`:

```ts
import { IsString, MinLength } from 'class-validator';

export class UpdateTeamDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
```

`apps/api/src/teams/dto/set-lead.dto.ts`:

```ts
import { IsUUID } from 'class-validator';

export class SetLeadDto {
  @IsUUID()
  leadUserId!: string;
}
```

- [ ] **Step 2: Write the failing service test**

`apps/api/src/teams/teams.service.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, type Role } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import { TeamsService } from './teams.service.js';
import { ConflictError, NotFoundError } from '../common/domain-errors.js';

const service = new TeamsService();

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function org(slug = 'acme') {
  return prisma.organization.create({ data: { name: slug, slug, timezone: 'UTC' } });
}
async function user(orgId: string, email: string, role: Role = 'TEAM_LEAD') {
  return prisma.user.create({ data: { orgId, email, name: email, role, passwordHash: 'x' } });
}

describe('TeamsService', () => {
  it('creates a team with a same-organization lead', async () => {
    const acme = await org();
    const lead = await user(acme.id, 'lead@acme.test');
    const team = await service.create(acme.id, { name: 'Support', leadUserId: lead.id });
    expect(team).toMatchObject({ name: 'Support', leadUserId: lead.id });
  });

  it('rejects a duplicate team name within the organization', async () => {
    const acme = await org();
    const lead = await user(acme.id, 'lead@acme.test');
    await service.create(acme.id, { name: 'Support', leadUserId: lead.id });
    await expect(
      service.create(acme.id, { name: 'Support', leadUserId: lead.id }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a lead from another organization', async () => {
    const acme = await org('acme');
    const other = await org('other');
    const otherLead = await user(other.id, 'lead@other.test');
    await expect(
      service.create(acme.id, { name: 'Support', leadUserId: otherLead.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('unassigns members when a team is deleted', async () => {
    const acme = await org();
    const lead = await user(acme.id, 'lead@acme.test');
    const team = await service.create(acme.id, { name: 'Support', leadUserId: lead.id });
    const member = await user(acme.id, 'm@acme.test', 'AGENT');
    await prisma.user.update({ where: { id: member.id }, data: { teamId: team.id } });

    await service.remove(acme.id, team.id);
    expect(await prisma.team.findFirst({ where: { id: team.id } })).toBeNull();
    const after = await prisma.user.findFirstOrThrow({ where: { id: member.id } });
    expect(after.teamId).toBeNull();
  });
});
```

- [ ] **Step 3: Write the service**

`apps/api/src/teams/teams.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { prisma } from '@supportops/db';
import { ConflictError, NotFoundError } from '../common/domain-errors.js';
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
```

- [ ] **Step 4: Write the controller and module**

`apps/api/src/teams/teams.controller.ts`:

```ts
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
import { CurrentOrg, JwtAuthGuard, Roles, RolesGuard } from '@supportops/auth';
import { PageQueryDto, type Paginated } from '../common/pagination.js';
import { TeamsService } from './teams.service.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { UpdateTeamDto } from './dto/update-team.dto.js';
import { SetLeadDto } from './dto/set-lead.dto.js';
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
}
```

`apps/api/src/teams/teams.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';

@Module({ controllers: [TeamsController], providers: [TeamsService], exports: [TeamsService] })
export class TeamsModule {}
```

Wire it in `apps/api/src/app.module.ts` (import and add `TeamsModule` to `imports`).

- [ ] **Step 5: Write the failing endpoint test**

`apps/api/test/teams.spec.ts`:

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

async function seedOwner(): Promise<{ orgId: string; token: string }> {
  const org = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'owner@acme.test',
      name: 'Owner',
      role: 'OWNER',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ orgSlug: 'acme', email: 'owner@acme.test', password: 's3cret-password' });
  return { orgId: org.id, token: res.body.accessToken as string };
}

describe('/teams', () => {
  it('creates and lists teams in a page envelope', async () => {
    const { orgId, token } = await seedOwner();
    const lead = await prisma.user.create({
      data: {
        orgId,
        email: 'lead@acme.test',
        name: 'Lead',
        role: 'TEAM_LEAD',
        passwordHash: await hashPassword('s3cret-password'),
      },
    });
    const created = await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Support', leadUserId: lead.id });
    expect(created.status).toBe(201);

    const res = await request(app.getHttpServer())
      .get('/teams')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(res.body.data[0].name).toBe('Support');
  });

  it('rejects a duplicate team name with 409', async () => {
    const { orgId, token } = await seedOwner();
    const lead = await prisma.user.create({
      data: {
        orgId,
        email: 'lead@acme.test',
        name: 'Lead',
        role: 'TEAM_LEAD',
        passwordHash: await hashPassword('s3cret-password'),
      },
    });
    await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Support', leadUserId: lead.id })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Support', leadUserId: lead.id });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 6: Run to verify fail, then pass**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test
pnpm --filter @supportops/api typecheck
```

Expected: FAIL before Steps 1–4, then all PASS. Root lint and format clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): teams CRUD, paged listing, and lead management

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: `teams` — membership management with team-lead confinement (TDD)

**Files:**

- Create: `apps/api/src/teams/dto/manage-members.dto.ts`
- Modify: `apps/api/src/teams/teams.service.ts` (add `manageMembers`), `apps/api/src/teams/teams.controller.ts` (add route)
- Test: `apps/api/src/teams/teams.service.spec.ts` (extend), `apps/api/test/teams.spec.ts` (extend)

**Interfaces:**

- Consumes: the `TeamsService` from Task 8; `Role`, `AuthPrincipal`, `CurrentUser`.
- Produces:
  - `class ManageMembersDto { add?: string[]; remove?: string[] }`
  - `TeamsService.manageMembers(orgId, actor: { userId; role }, teamId, dto): Promise<void>`
  - `PATCH /teams/:id/members` (`OWNER`/`ADMIN`/`TEAM_LEAD`, the lead confined to their own team)

- [ ] **Step 1: Write the DTO**

`apps/api/src/teams/dto/manage-members.dto.ts`:

```ts
import { ArrayUnique, IsArray, IsOptional, IsUUID } from 'class-validator';

export class ManageMembersDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  add?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  remove?: string[];
}
```

- [ ] **Step 2: Extend the service test (TDD)**

Append to `apps/api/src/teams/teams.service.spec.ts` (add `ForbiddenActionError` to the imports from `../common/domain-errors.js`):

```ts
describe('TeamsService.manageMembers', () => {
  it('adds and removes members', async () => {
    const acme = await org();
    const lead = await user(acme.id, 'lead@acme.test');
    const team = await service.create(acme.id, { name: 'Support', leadUserId: lead.id });
    const member = await user(acme.id, 'm@acme.test', 'AGENT');

    await service.manageMembers(acme.id, { userId: lead.id, role: 'ADMIN' }, team.id, {
      add: [member.id],
    });
    expect((await prisma.user.findFirstOrThrow({ where: { id: member.id } })).teamId).toBe(team.id);

    await service.manageMembers(acme.id, { userId: lead.id, role: 'ADMIN' }, team.id, {
      remove: [member.id],
    });
    expect((await prisma.user.findFirstOrThrow({ where: { id: member.id } })).teamId).toBeNull();
  });

  it('lets a team lead manage only the team they lead', async () => {
    const acme = await org();
    const lead = await user(acme.id, 'lead@acme.test');
    const otherLead = await user(acme.id, 'other-lead@acme.test');
    const mine = await service.create(acme.id, { name: 'Mine', leadUserId: lead.id });
    const theirs = await service.create(acme.id, { name: 'Theirs', leadUserId: otherLead.id });
    const member = await user(acme.id, 'm@acme.test', 'AGENT');

    await expect(
      service.manageMembers(acme.id, { userId: lead.id, role: 'TEAM_LEAD' }, mine.id, {
        add: [member.id],
      }),
    ).resolves.toBeUndefined();
    await expect(
      service.manageMembers(acme.id, { userId: lead.id, role: 'TEAM_LEAD' }, theirs.id, {
        add: [member.id],
      }),
    ).rejects.toBeInstanceOf(ForbiddenActionError);
  });

  it('rejects a member from another organization', async () => {
    const acme = await org('acme');
    const other = await org('other');
    const lead = await user(acme.id, 'lead@acme.test');
    const team = await service.create(acme.id, { name: 'Support', leadUserId: lead.id });
    const outsider = await user(other.id, 'x@other.test', 'AGENT');
    await expect(
      service.manageMembers(acme.id, { userId: lead.id, role: 'ADMIN' }, team.id, {
        add: [outsider.id],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

- [ ] **Step 3: Add the service method**

Append to the `TeamsService` class in `apps/api/src/teams/teams.service.ts` (add `ForbiddenActionError` to the imports from `../common/domain-errors.js`):

```ts
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
      prisma.user.updateMany({ where: { orgId, id: { in: remove }, teamId }, data: { teamId: null } }),
    ]);
  }

  private async assertUsersInOrg(orgId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await prisma.user.count({ where: { orgId, id: { in: ids } } });
    if (found !== new Set(ids).size) throw new NotFoundError('One or more users were not found');
  }
```

- [ ] **Step 4: Add the controller route**

Add the imports and route to `apps/api/src/teams/teams.controller.ts`:

```ts
import { CurrentUser, type AuthPrincipal } from '@supportops/auth';
import { ManageMembersDto } from './dto/manage-members.dto.js';
```

```ts
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
```

> `CurrentUser`/`AuthPrincipal` join the existing `@supportops/auth` import; merge, don't duplicate the import line.

- [ ] **Step 5: Extend the endpoint test (TDD)**

Append to `apps/api/test/teams.spec.ts` inside `describe('/teams', ...)`:

```ts
it('confines a team lead to their own team over HTTP', async () => {
  const { orgId } = await seedOwner();
  const lead = await prisma.user.create({
    data: {
      orgId,
      email: 'lead@acme.test',
      name: 'Lead',
      role: 'TEAM_LEAD',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const otherLead = await prisma.user.create({
    data: {
      orgId,
      email: 'other-lead@acme.test',
      name: 'Other',
      role: 'TEAM_LEAD',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const theirs = await prisma.team.create({
    data: { orgId, name: 'Theirs', leadUserId: otherLead.id },
  });
  const member = await prisma.user.create({
    data: {
      orgId,
      email: 'm@acme.test',
      name: 'M',
      role: 'AGENT',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ orgSlug: 'acme', email: 'lead@acme.test', password: 's3cret-password' });
  const res = await request(app.getHttpServer())
    .patch(`/teams/${theirs.id}/members`)
    .set('Authorization', `Bearer ${login.body.accessToken}`)
    .send({ add: [member.id] });
  expect(res.status).toBe(403);
});
```

- [ ] **Step 6: Run to verify fail, then pass**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test
pnpm --filter @supportops/api typecheck
```

Expected: the membership cases FAIL before Steps 1–4, then all PASS. Then run the whole suite once more to confirm the phase is green end to end:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): team membership management confined to the owning lead

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Definition of done (Phase 4)

- `apps/api` exposes organization-scoped, role-gated management endpoints:
  - `GET /orgs/me` (all roles) and `PATCH /orgs/me` (`OWNER`/`ADMIN`, name/timezone only; slug immutable).
  - `users`: paged list + read (all roles); create/update/delete and role/team changes (`OWNER`/`ADMIN`) with escalation and last-owner guards; self-service `PATCH /users/me` and `PATCH /users/me/password`.
  - `teams`: paged list + read (all roles); create/rename/set-lead/delete (`OWNER`/`ADMIN`); membership (`OWNER`/`ADMIN`, and a `TEAM_LEAD` confined to their own team).
  - `customers`: full CRUD with paged list, writable by every authenticated role.
- Every list returns the shared `{ data, page, pageSize, total }` envelope with `?q=` filtering.
- Organization isolation holds on every query; cross-tenant access returns `404`, uniqueness violations `409`, forbidden actions `403`, validation failures `400`.
- The `@supportops/auth` guards match `Bearer` case-insensitively, reject malformed claims, and are available application-wide; the deferred Phase-3 test follow-ups are in place.
- Every service method is unit-tested against a real Postgres, and every endpoint has a `supertest` integration test; `pnpm typecheck`, `pnpm lint`, and `pnpm test` are green locally and in CI.
- ADRs 0009 and 0010 record the authorization model and the list convention.
- Delivered as a reviewed PR (feature branch → `develop`); merging stays a human decision.

## Not in Phase 4 (later phases)

Organization creation / tenant signup; tickets and ticket comments and their assignment
rules; the `packages/notifications` transport, `packages/queue`, and the
`notification-worker`; and the `apps/web` client. These build on the domain surface
established here.
