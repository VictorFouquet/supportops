# Phase 3 — Auth & API foundation (`packages/auth`, `apps/api`)

> Executed task by task. Each task is a small, independently testable slice that ends green — tests, lint, and typecheck all passing — before the next begins. Steps use checkboxes (`- [ ]`) for tracking.

**Goal:** Stand up authentication and the first HTTP surface — a reusable `@supportops/auth` toolkit (password hashing, JWT verification, `RolesGuard`, `@Roles`/`@CurrentUser`/`@CurrentOrg`) and a NestJS `apps/api` wired to it with `POST /auth/login`, a guarded `GET /auth/me`, `GET /health`, DTO validation, and an exception filter — so every later domain module slots into an established `Controller → Service → Prisma` + RBAC pattern.

**Architecture:** `packages/auth` is a framework-aware toolkit: `@node-rs/argon2` password hashing, an `AuthModule.register({ secret, expiresIn })` that configures `@nestjs/jwt`, a `JwtAuthGuard` that verifies the bearer token and attaches a typed principal, a `RolesGuard` that enforces `@Roles()`, and param decorators. `apps/api` is a NestJS app that owns tenant-aware login (resolve org by slug → find user by `(orgId, email)` → verify password → sign a short-lived access token), a guarded `me` endpoint that returns a DTO, and a liveness route. Auth logic never touches Prisma outside `*.service.ts`; responses are built from DTOs so `passwordHash` never serializes.

**Tech Stack:** NestJS 10 (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/jwt`), `@node-rs/argon2`, `class-validator` + `class-transformer`, `reflect-metadata`, RxJS 7, Vitest 2 with `unplugin-swc` + `@swc/core` (decorator metadata), `supertest`, TypeScript 5.5, PostgreSQL 16.

## Global Constraints

- **RBAC-always.** Guarded routes sit behind `JwtAuthGuard`; role-restricted routes add `RolesGuard` + `@Roles(...)`. No new auth path is invented — everything reuses `@supportops/auth`.
- **Prisma stays in services.** Only `*.service.ts` touches the `@supportops/db` client. Controllers, guards, and DTOs never do.
- **Responses are DTOs.** Endpoints return explicit DTO shapes. `passwordHash` and internal fields are never serialized.
- **Org isolation.** Every user lookup is scoped by `orgId`; login resolves the tenant (org slug) before touching users, honoring the `@@unique([orgId, email])` schema.
- **Passwords are argon2id.** Hashing uses `@node-rs/argon2` defaults (argon2id). Plaintext passwords are never stored or logged.
- **Tokens are stateless access JWTs.** `POST /auth/login` returns one short-lived signed JWT (`expiresIn: '1h'`) with claims `{ sub, org, role }`. No refresh tokens, no server-side session store.
- **No credential enumeration.** Unknown org, unknown email, and wrong password all return the same `401`; login does constant work (verifies against a dummy hash when the user is absent) to avoid a timing oracle.
- **Time is UTC.** Timestamps remain `timestamptz` in UTC (unchanged from Phase 2).
- **Tests are non-optional.** Every service method has a co-located unit test; every endpoint has an integration test against a real Postgres.
- Node `>=20` (local and CI run Node 24); pnpm only (9.7.0); commits carry `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; work lands on `develop` via a feature branch and PR.

---

### Task 1: Record the auth & API decisions (ADRs 0007, 0008)

**Files:**

- Create: `docs/adr/0007-authentication-strategy.md`, `docs/adr/0008-api-framework-and-guards.md`
- Modify: `docs/adr/README.md` (append two rows)

**Interfaces:**

- Consumes: nothing (documentation).
- Produces: the accepted decisions the rest of the phase implements — argon2id + stateless access JWT (0007); NestJS with passport-free `JwtAuthGuard`/`RolesGuard`, a global validation pipe, and a domain exception filter (0008).

- [ ] **Step 1: Write ADR 0007**

`docs/adr/0007-authentication-strategy.md`:

```markdown
# 0007 — Authentication strategy

- **Status:** Accepted
- **Date:** 2026-08-22

## Context

The API is stateless and consumed by a browser client and, later, other services.
Users belong to exactly one organization, and the same email address may exist in two
different organizations (`users` is unique on `(org_id, email)`, not on `email` alone).
We need to authenticate a request cheaply on every call without a shared session store,
and we must not leak whether a given account exists.

## Decision

- **Passwords are hashed with argon2id** via `@node-rs/argon2` (prebuilt native
  bindings, no node-gyp build step). Defaults are accepted; plaintext is never stored
  or logged.
- **Sessions are stateless access JWTs.** `POST /auth/login` returns a single signed
  token with claims `{ sub, org, role }` and a one-hour expiry. There is no refresh
  token and no server-side session; a client re-authenticates when the token expires.
  Should long-lived sessions become a real need, that is a future, separately recorded
  decision.
- **Login is tenant-aware.** The caller supplies the organization slug alongside email
  and password; we resolve the organization, then the user within it. This respects the
  `(org_id, email)` uniqueness and keeps every lookup org-scoped.
- **No account enumeration.** Unknown organization, unknown email, and wrong password
  return an identical `401`, and login verifies against a dummy hash when no user is
  found so response time does not reveal existence.

## Consequences

- Any node can validate a token with only the signing secret; there is nothing to
  replicate or invalidate centrally, and logout is a client concern.
- A leaked token is valid until it expires; the one-hour lifetime bounds that exposure.
- The signing secret (`JWT_SECRET`) is required configuration and is validated at
  startup (minimum length) by `@supportops/config`.
```

- [ ] **Step 2: Write ADR 0008**

`docs/adr/0008-api-framework-and-guards.md`:

```markdown
# 0008 — API framework and authorization guards

- **Status:** Accepted
- **Date:** 2026-08-22

## Context

We need an HTTP framework for `apps/api` that gives us a clear module boundary per
domain, dependency injection, and first-class request validation, and that a new
contributor can read without surprises. Authorization must be declarative and impossible
to forget on a new route.

## Decision

- **NestJS** is the API framework. One module per domain; the flow is always
  `Controller → Service → Prisma`, with Prisma confined to services.
- **Authorization is guard-based and passport-free.** A `JwtAuthGuard` verifies the
  bearer token with `@nestjs/jwt` and attaches a typed principal to the request; a
  `RolesGuard` reads a `@Roles(...)` decorator and enforces it. Both live in
  `@supportops/auth` and are reused everywhere; we do not add Passport for a single
  stateless strategy.
- **Validation is global.** A global `ValidationPipe` (`whitelist`,
  `forbidNonWhitelisted`, `transform`) rejects unknown or malformed fields; request
  shapes are `class-validator` DTOs.
- **Errors are mapped centrally.** Typed domain errors are translated to HTTP status
  codes by a global exception filter, so services throw meaning, not status codes, and
  no stack trace or Prisma detail reaches a client.
- **Tests run on Vitest** (consistent with the rest of the monorepo) using
  `unplugin-swc` so decorator metadata is emitted for Nest's DI; endpoints are covered
  with `supertest` against a real Postgres.

## Consequences

- A new endpoint is a controller method plus a service method plus a DTO; authorization
  is one decorator, and forgetting it is visible in review.
- The app depends on emitted decorator metadata, so both the build (`tsc`) and the test
  runner (`swc`) must enable it; this is configured once per package.
- Swapping the framework later would touch controllers and guards but not the domain
  services, which hold no framework types.
```

- [ ] **Step 3: Append the two rows to the ADR index**

In `docs/adr/README.md`, add to the table after the `0006` row:

```markdown
| 0007 | Authentication strategy                         | Accepted |
| 0008 | API framework and authorization guards          | Accepted |
```

- [ ] **Step 4: Verify formatting and commit**

```bash
cd /home/victor/Documents/coding/supportops
pnpm exec prettier --check "docs/**/*.md"
```

Expected: Prettier reports the new files as formatted (run `pnpm exec prettier --write "docs/**/*.md"` if not, then re-check).

```bash
git add -A
git commit -m "docs(adr): record authentication strategy and API framework decisions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `@supportops/auth` — scaffold and password hashing (TDD)

**Files:**

- Create: `packages/auth/package.json`, `packages/auth/tsconfig.json`, `packages/auth/vitest.config.ts`, `packages/auth/src/password.ts`
- Test: `packages/auth/src/password.spec.ts`

**Interfaces:**

- Consumes: `tsconfig.base.json` (Phase 1).
- Produces: `hashPassword(plain: string): Promise<string>` and `verifyPassword(hashed: string, plain: string): Promise<boolean>`, both re-exported from `@supportops/auth`.

- [ ] **Step 1: Write the package manifest, tsconfig, and vitest config**

`packages/auth/package.json`:

```json
{
  "name": "@supportops/auth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.4",
    "@nestjs/core": "^10.4.4",
    "@nestjs/jwt": "^10.2.0",
    "@node-rs/argon2": "^2.0.0",
    "@supportops/db": "workspace:*"
  },
  "devDependencies": {
    "@swc/core": "^1.7.26",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "typescript": "^5.5.4",
    "unplugin-swc": "^1.5.1",
    "vitest": "^2.0.5"
  }
}
```

`packages/auth/tsconfig.json` (Nest decorators require the two `experimental*`/`emit*` flags):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.spec.ts"]
}
```

`packages/auth/vitest.config.ts` (swc emits the decorator metadata Nest's DI needs):

```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    setupFiles: ['reflect-metadata'],
  },
});
```

- [ ] **Step 2: Write the failing password test**

`packages/auth/src/password.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('produces an argon2id hash that verifies against the original', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hash, 'Tr0ub4dor&3')).toBe(false);
  });

  it('returns false (never throws) on a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /home/victor/Documents/coding/supportops
pnpm install
pnpm --filter @supportops/auth test
```

Expected: FAIL — `./password.js` does not exist yet.

- [ ] **Step 4: Write the implementation**

`packages/auth/src/password.ts`:

```ts
import { hash, verify } from '@node-rs/argon2';

/** Hash a plaintext password with argon2id (library defaults). */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** Verify a plaintext password against a stored hash; false on any mismatch or malformed hash. */
export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run tests and typecheck to verify green**

```bash
pnpm --filter @supportops/auth test
pnpm --filter @supportops/auth typecheck
```

Expected: all three cases PASS; typecheck exits 0. Root `pnpm exec eslint .` and `pnpm exec prettier --check .` are clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): add @supportops/auth with argon2id password hashing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `@supportops/auth` — tokens, guards, decorators, module (TDD)

**Files:**

- Create: `packages/auth/src/tokens.ts`, `packages/auth/src/decorators.ts`, `packages/auth/src/jwt-auth.guard.ts`, `packages/auth/src/roles.guard.ts`, `packages/auth/src/auth.module.ts`, `packages/auth/src/index.ts`
- Test: `packages/auth/src/guards.spec.ts`

**Interfaces:**

- Consumes: `Role` (type) from `@supportops/db`; `JwtService` from `@nestjs/jwt`; `Reflector` from `@nestjs/core`; `hashPassword`/`verifyPassword` from Task 2.
- Produces, all re-exported from `@supportops/auth`:
  - `interface AccessTokenClaims { sub: string; org: string; role: Role }`
  - `interface AuthPrincipal { userId: string; orgId: string; role: Role }`
  - `const ROLES_KEY = 'roles'`; `Roles(...roles: Role[])`; `CurrentUser()` → `AuthPrincipal`; `CurrentOrg()` → `string`
  - `class JwtAuthGuard implements CanActivate` (verifies bearer, sets `req.principal`)
  - `class RolesGuard implements CanActivate` (enforces `@Roles`)
  - `class AuthModule` with `static register({ secret, expiresIn }): DynamicModule` exporting `JwtAuthGuard`, `RolesGuard`, and `JwtModule`

- [ ] **Step 1: Write the token and principal types**

`packages/auth/src/tokens.ts`:

```ts
import type { Role } from '@supportops/db';

/** Claims carried inside a signed access token. */
export interface AccessTokenClaims {
  sub: string; // user id
  org: string; // organization id
  role: Role;
}

/** The authenticated principal attached to a request by JwtAuthGuard. */
export interface AuthPrincipal {
  userId: string;
  orgId: string;
  role: Role;
}
```

- [ ] **Step 2: Write the decorators**

`packages/auth/src/decorators.ts`:

```ts
import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@supportops/db';
import type { AuthPrincipal } from './tokens.js';

export const ROLES_KEY = 'roles';

/** Restrict a route to the given roles; enforced by RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Inject the authenticated principal into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal =>
    ctx.switchToHttp().getRequest<{ principal: AuthPrincipal }>().principal,
);

/** Inject the authenticated principal's organization id. */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<{ principal: AuthPrincipal }>().principal.orgId,
);
```

- [ ] **Step 3: Write the guards**

`packages/auth/src/jwt-auth.guard.ts`:

```ts
import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims, AuthPrincipal } from './tokens.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; principal?: AuthPrincipal }>();
    const header = request.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length);
    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    request.principal = { userId: claims.sub, orgId: claims.org, role: claims.role };
    return true;
  }
}
```

`packages/auth/src/roles.guard.ts`:

```ts
import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@supportops/db';
import { ROLES_KEY } from './decorators.js';
import type { AuthPrincipal } from './tokens.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ principal?: AuthPrincipal }>();
    const principal = request.principal;
    if (!principal || !required.includes(principal.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
```

- [ ] **Step 4: Write the module and barrel export**

`packages/auth/src/auth.module.ts`:

```ts
import { Module, type DynamicModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

@Module({})
export class AuthModule {
  /** Configure JWT signing/verification and expose the guards. */
  static register(options: { secret: string; expiresIn: string }): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        JwtModule.register({
          secret: options.secret,
          signOptions: { expiresIn: options.expiresIn },
        }),
      ],
      providers: [JwtAuthGuard, RolesGuard],
      exports: [JwtAuthGuard, RolesGuard, JwtModule],
    };
  }
}
```

`packages/auth/src/index.ts`:

```ts
export { hashPassword, verifyPassword } from './password.js';
export type { AccessTokenClaims, AuthPrincipal } from './tokens.js';
export { ROLES_KEY, Roles, CurrentUser, CurrentOrg } from './decorators.js';
export { JwtAuthGuard } from './jwt-auth.guard.js';
export { RolesGuard } from './roles.guard.js';
export { AuthModule } from './auth.module.js';
```

- [ ] **Step 5: Write the failing guard tests**

`packages/auth/src/guards.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { UnauthorizedException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { Roles } from './decorators.js';
import type { AuthPrincipal } from './tokens.js';

function contextFor(request: unknown, handler: () => void = () => {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'test-secret-at-least-16', signOptions: { expiresIn: '1h' } });
  const guard = new JwtAuthGuard(jwt);

  it('attaches a principal for a valid bearer token', async () => {
    const token = await jwt.signAsync({ sub: 'u1', org: 'o1', role: 'AGENT' });
    const request: { headers: Record<string, string>; principal?: AuthPrincipal } = {
      headers: { authorization: `Bearer ${token}` },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.principal).toEqual({ userId: 'u1', orgId: 'o1', role: 'AGENT' });
  });

  it('rejects a missing token', async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a malformed token', async () => {
    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer garbage' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  // A handler carrying @Roles('ADMIN') metadata.
  class Probe {
    @Roles('ADMIN')
    handler() {}
  }
  const adminHandler = Object.getOwnPropertyDescriptor(Probe.prototype, 'handler')!.value;

  it('allows a principal whose role is permitted', () => {
    const request = { principal: { userId: 'u', orgId: 'o', role: 'ADMIN' } };
    expect(guard.canActivate(contextFor(request, adminHandler))).toBe(true);
  });

  it('forbids a principal whose role is not permitted', () => {
    const request = { principal: { userId: 'u', orgId: 'o', role: 'AGENT' } };
    expect(() => guard.canActivate(contextFor(request, adminHandler))).toThrow(ForbiddenException);
  });

  it('allows any request when no roles are required', () => {
    expect(guard.canActivate(contextFor({ principal: undefined }))).toBe(true);
  });
});
```

- [ ] **Step 6: Run to verify fail, then pass**

```bash
cd /home/victor/Documents/coding/supportops
pnpm --filter @supportops/auth test
```

Expected: initially FAIL (guards/decorators not yet created), then PASS once Steps 1–4 files exist. Then:

```bash
pnpm --filter @supportops/auth typecheck
```

Expected: exits 0. Root `pnpm exec eslint .` and `pnpm exec prettier --check .` are clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): jwt guard, roles guard, decorators, and auth module

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `apps/api` bootstrap — app, health route, test harness (TDD)

**Files:**

- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/src/health/health.module.ts`, `apps/api/test/global-setup.ts`, `apps/api/test/db.ts`, `apps/api/test/app.ts`
- Test: `apps/api/test/health.spec.ts`

**Interfaces:**

- Consumes: `loadConfig`/`AppConfig` from `@supportops/config`; the committed migrations and `prisma` client from `@supportops/db`; `AuthModule` from `@supportops/auth` (registered in Task 5).
- Produces: a bootable Nest app; `AppModule.register(config: AppConfig): DynamicModule`; a `GET /health` → `{ status: 'ok' }`; and the reusable integration harness `buildTestApp()` (returns `{ app, prisma }`) plus `resetDb()`.

- [ ] **Step 1: Write the manifest, tsconfig, and vitest config**

`apps/api/package.json`:

```json
{
  "name": "@supportops/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js",
    "test": "vitest run",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.4",
    "@nestjs/core": "^10.4.4",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/platform-express": "^10.4.4",
    "@supportops/auth": "workspace:*",
    "@supportops/config": "workspace:*",
    "@supportops/db": "workspace:*",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@swc/core": "^1.7.26",
    "@types/supertest": "^6.0.2",
    "pg": "^8.12.0",
    "prisma": "^5.22.0",
    "supertest": "^7.0.0",
    "typescript": "^5.5.4",
    "unplugin-swc": "^1.5.1",
    "vitest": "^2.0.5"
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src"],
  "exclude": ["test", "src/**/*.spec.ts"]
}
```

`apps/api/vitest.config.ts` (the integration DB URL is derived from `TEST_DATABASE_URL`; safe local/CI defaults for the rest so `loadConfig` passes):

```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const testDbUrl =
  process.env.TEST_DATABASE_URL ??
  'postgres://supportops:supportops@localhost:5432/supportops_test';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    globalSetup: ['./test/global-setup.ts'],
    // Integration tests share one database; run files serially.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDbUrl,
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      JWT_SECRET: process.env.JWT_SECRET ?? 'test-secret-at-least-16-chars',
    },
  },
});
```

- [ ] **Step 2: Write the test DB setup and reset helper**

`apps/api/test/global-setup.ts` (create + migrate the dedicated test database, mirroring the data-layer harness):

```ts
import { execSync } from 'node:child_process';
import { Client } from 'pg';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://supportops:supportops@localhost:5432/supportops_test';

export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbName}"`);
  } catch (err) {
    if ((err as { code?: string }).code !== '42P04') throw err; // 42P04 = duplicate_database
  } finally {
    await client.end();
  }

  execSync('prisma migrate deploy --schema ../../packages/db/prisma/schema.prisma', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
```

`apps/api/test/db.ts`:

```ts
import { prisma } from '@supportops/db';

/** Empty every domain table between tests. CASCADE clears dependent rows. */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE notifications, ticket_comments, tickets, customers, teams, users, organizations RESTART IDENTITY CASCADE',
  );
}
```

- [ ] **Step 3: Write the health module and app module**

`apps/api/src/health/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
```

`apps/api/src/health/health.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

`apps/api/src/app.module.ts` (auth feature module is added in Task 5):

```ts
import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from '@supportops/config';
import { HealthModule } from './health/health.module.js';

@Module({})
export class AppModule {
  static register(_config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [HealthModule],
    };
  }
}
```

- [ ] **Step 4: Write the bootstrap and the test app builder**

`apps/api/src/main.ts`:

```ts
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '@supportops/config';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule.register(config));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

void bootstrap();
```

`apps/api/test/app.ts`:

```ts
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '@supportops/config';
import { prisma } from '@supportops/db';
import { AppModule } from '../src/app.module.js';

export interface TestContext {
  app: INestApplication;
  prisma: typeof prisma;
}

/** Build the full Nest app with the same global pipes/filters as production. */
export async function buildTestApp(): Promise<TestContext> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule.register(config), { logger: false });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return { app, prisma };
}
```

- [ ] **Step 5: Write the failing health integration test**

`apps/api/test/health.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { buildTestApp } from './app.js';

let app: INestApplication;

beforeAll(async () => {
  ({ app } = await buildTestApp());
});
afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('reports liveness without auth', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 6: Run to verify fail, then pass**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm install
pnpm --filter @supportops/api test
```

Expected: FAIL first (app/health files or harness missing), then PASS once Steps 1–5 are in place — `global-setup` creates and migrates `supportops_test`, the app boots, and `/health` returns `{ status: 'ok' }`.

```bash
pnpm --filter @supportops/api typecheck
```

Expected: exits 0. Root `pnpm exec eslint .` and `pnpm exec prettier --check .` are clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): bootstrap NestJS app with health route and test harness

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `POST /auth/login` — errors, filter, service, controller (TDD)

**Files:**

- Create: `apps/api/src/common/domain-errors.ts`, `apps/api/src/common/domain-exception.filter.ts`, `apps/api/src/auth/dto/login.dto.ts`, `apps/api/src/auth/dto/login-response.dto.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/app.module.ts` (import the auth feature module), `apps/api/src/main.ts` and `apps/api/test/app.ts` (register the global exception filter)
- Test: `apps/api/src/auth/auth.service.spec.ts`, `apps/api/test/auth-login.spec.ts`

**Interfaces:**

- Consumes: `hashPassword`/`verifyPassword`, `AuthModule`, `AccessTokenClaims` from `@supportops/auth`; `prisma` from `@supportops/db`; `AppConfig` from `@supportops/config`; the harness from Task 4.
- Produces:
  - `class InvalidCredentialsError extends Error`
  - `class DomainExceptionFilter` mapping domain errors → HTTP (`InvalidCredentialsError` → 401)
  - `AuthService.login(orgSlug: string, email: string, password: string): Promise<{ accessToken: string }>`
  - `POST /auth/login` accepting `{ orgSlug, email, password }`, returning `{ accessToken }`
  - `AuthModule.register(config: AppConfig): DynamicModule` (app feature module)

- [ ] **Step 1: Write the domain error and exception filter**

`apps/api/src/common/domain-errors.ts`:

```ts
/** Base for errors that map to a deliberate HTTP response. */
export abstract class DomainError extends Error {}

/** Login failed — org, email, or password did not match. Always a 401, never says which. */
export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('Invalid credentials');
    this.name = 'InvalidCredentialsError';
  }
}
```

`apps/api/src/common/domain-exception.filter.ts`:

```ts
import {
  Catch,
  HttpException,
  UnauthorizedException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, InvalidCredentialsError } from './domain-errors.js';

/** Translate typed domain errors into HTTP responses; re-throw framework HttpExceptions untouched. */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof InvalidCredentialsError) {
      response.status(401).json({ statusCode: 401, message: 'Invalid credentials' });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json(exception.getResponse());
      return;
    }
    if (exception instanceof DomainError) {
      response.status(400).json({ statusCode: 400, message: exception.message });
      return;
    }
    // Unknown/unexpected: do not leak internals.
    response.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
}
```

- [ ] **Step 2: Write the login DTOs**

`apps/api/src/auth/dto/login.dto.ts`:

```ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  orgSlug!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
```

`apps/api/src/auth/dto/login-response.dto.ts`:

```ts
export interface LoginResponseDto {
  accessToken: string;
}
```

- [ ] **Step 3: Write the auth service and its unit test (TDD)**

`apps/api/src/auth/auth.service.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { hashPassword, type AccessTokenClaims } from '@supportops/auth';
import { prisma } from '@supportops/db';
import { resetDb } from '../../test/db.js';
import { AuthService } from './auth.service.js';
import { InvalidCredentialsError } from '../common/domain-errors.js';

const jwt = new JwtService({ secret: 'test-secret-at-least-16-chars', signOptions: { expiresIn: '1h' } });
const service = new AuthService(jwt);

async function seedUser() {
  const org = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'ada@acme.test',
      name: 'Ada',
      role: 'AGENT',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  return { org, user };
}

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

describe('AuthService.login', () => {
  it('issues a token with the user, org, and role for valid credentials', async () => {
    const { org, user } = await seedUser();
    const { accessToken } = await service.login('acme', 'ada@acme.test', 's3cret-password');
    const claims = await jwt.verifyAsync<AccessTokenClaims>(accessToken);
    expect(claims.sub).toBe(user.id);
    expect(claims.org).toBe(org.id);
    expect(claims.role).toBe('AGENT');
  });

  it('rejects a wrong password', async () => {
    await seedUser();
    await expect(service.login('acme', 'ada@acme.test', 'wrong')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('rejects an unknown email without revealing it', async () => {
    await seedUser();
    await expect(service.login('acme', 'nobody@acme.test', 's3cret-password')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('rejects an unknown organization', async () => {
    await seedUser();
    await expect(service.login('ghost', 'ada@acme.test', 's3cret-password')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });
});
```

`apps/api/src/auth/auth.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hashPassword, verifyPassword, type AccessTokenClaims } from '@supportops/auth';
import { prisma } from '@supportops/db';
import { InvalidCredentialsError } from '../common/domain-errors.js';
import type { LoginResponseDto } from './dto/login-response.dto.js';

// A precomputed argon2id hash used when no user is found, so login does constant work
// and cannot be used to enumerate accounts by timing.
let dummyHashPromise: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('constant-time-placeholder');
  return dummyHashPromise;
}

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async login(orgSlug: string, email: string, password: string): Promise<LoginResponseDto> {
    const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
    const user = org
      ? await prisma.user.findUnique({ where: { orgId_email: { orgId: org.id, email } } })
      : null;

    const hash = user?.passwordHash ?? (await dummyHash());
    const ok = await verifyPassword(hash, password);
    if (!user || !ok) throw new InvalidCredentialsError();

    const claims: AccessTokenClaims = { sub: user.id, org: user.orgId, role: user.role };
    const accessToken = await this.jwt.signAsync(claims);
    return { accessToken };
  }
}
```

- [ ] **Step 4: Write the controller and feature module**

`apps/api/src/auth/auth.controller.ts`:

```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import type { LoginResponseDto } from './dto/login-response.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.auth.login(dto.orgSlug, dto.email, dto.password);
  }
}
```

`apps/api/src/auth/auth.module.ts`:

```ts
import { Module, type DynamicModule } from '@nestjs/common';
import { AuthModule as AuthCoreModule } from '@supportops/auth';
import type { AppConfig } from '@supportops/config';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({})
export class AuthModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AuthModule,
      imports: [AuthCoreModule.register({ secret: config.JWT_SECRET, expiresIn: '1h' })],
      controllers: [AuthController],
      providers: [AuthService],
      exports: [AuthCoreModule],
    };
  }
}
```

- [ ] **Step 5: Wire the feature module and global filter**

Update `apps/api/src/app.module.ts` to import the auth feature module:

```ts
import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from '@supportops/config';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [HealthModule, AuthModule.register(config)],
    };
  }
}
```

Register the filter globally in `apps/api/src/main.ts` (add the import and the `useGlobalFilters` call):

```ts
import { DomainExceptionFilter } from './common/domain-exception.filter.js';
// ...after useGlobalPipes(...):
app.useGlobalFilters(new DomainExceptionFilter());
```

And the same in `apps/api/test/app.ts` (so tests exercise the real error mapping), after `useGlobalPipes`:

```ts
import { DomainExceptionFilter } from '../src/common/domain-exception.filter.js';
// ...
app.useGlobalFilters(new DomainExceptionFilter());
```

- [ ] **Step 6: Write the failing login integration test**

`apps/api/test/auth-login.spec.ts`:

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

async function seedAgent() {
  const org = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'ada@acme.test',
      name: 'Ada',
      role: 'AGENT',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
}

describe('POST /auth/login', () => {
  it('returns an access token for valid credentials', async () => {
    await seedAgent();
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ orgSlug: 'acme', email: 'ada@acme.test', password: 's3cret-password' });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('returns 401 for a wrong password', async () => {
    await seedAgent();
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ orgSlug: 'acme', email: 'ada@acme.test', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.accessToken).toBeUndefined();
  });

  it('returns 401 for an unknown org or email (no enumeration)', async () => {
    await seedAgent();
    const unknownOrg = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ orgSlug: 'ghost', email: 'ada@acme.test', password: 's3cret-password' });
    const unknownEmail = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ orgSlug: 'acme', email: 'nobody@acme.test', password: 's3cret-password' });
    expect(unknownOrg.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ada@acme.test' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 7: Run to verify fail, then pass**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test
```

Expected: the service and login specs FAIL before Steps 1–5 exist, then all PASS. Typecheck and lint clean:

```bash
pnpm --filter @supportops/api typecheck
pnpm exec eslint .
pnpm exec prettier --check .
```

Expected: all exit 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): tenant-aware login issuing stateless access tokens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `GET /auth/me` — guarded endpoint returning a DTO (TDD)

**Files:**

- Create: `apps/api/src/auth/dto/me.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts` (add `me`), `apps/api/src/auth/auth.controller.ts` (add guarded `GET /auth/me`)
- Test: `apps/api/test/auth-me.spec.ts`

**Interfaces:**

- Consumes: `JwtAuthGuard`, `CurrentUser`, `AuthPrincipal` from `@supportops/auth`; the login flow from Task 5.
- Produces:
  - `interface MeDto { id: string; email: string; name: string; role: Role; orgId: string; teamId: string | null }`
  - `AuthService.me(userId: string, orgId: string): Promise<MeDto>` (org-scoped; excludes `passwordHash`)
  - `GET /auth/me` behind `JwtAuthGuard`, returning `MeDto`

- [ ] **Step 1: Write the me DTO**

`apps/api/src/auth/dto/me.dto.ts`:

```ts
import type { Role } from '@supportops/db';

export interface MeDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgId: string;
  teamId: string | null;
}
```

- [ ] **Step 2: Add the `me` service method**

Append to `apps/api/src/auth/auth.service.ts` (import `MeDto` at the top):

```ts
import type { MeDto } from './dto/me.dto.js';
```

```ts
  async me(userId: string, orgId: string): Promise<MeDto> {
    // Org-scoped lookup: a token's user must belong to the token's org.
    const user = await prisma.user.findFirst({ where: { id: userId, orgId } });
    if (!user) throw new InvalidCredentialsError();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
      teamId: user.teamId,
    };
  }
```

- [ ] **Step 3: Add the guarded controller route**

Update `apps/api/src/auth/auth.controller.ts` (add imports and the route):

```ts
import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthPrincipal } from '@supportops/auth';
import type { MeDto } from './dto/me.dto.js';
```

```ts
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() principal: AuthPrincipal): Promise<MeDto> {
    return this.auth.me(principal.userId, principal.orgId);
  }
```

- [ ] **Step 4: Write the failing integration test**

`apps/api/test/auth-me.spec.ts`:

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

async function loginAsAgent(): Promise<string> {
  const org = await prisma.organization.create({
    data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
  });
  await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'ada@acme.test',
      name: 'Ada',
      role: 'AGENT',
      passwordHash: await hashPassword('s3cret-password'),
    },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ orgSlug: 'acme', email: 'ada@acme.test', password: 's3cret-password' });
  return res.body.accessToken as string;
}

describe('GET /auth/me', () => {
  it('returns the current user for a valid token and never leaks the password hash', async () => {
    const token = await loginAsAgent();
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('ada@acme.test');
    expect(res.body.role).toBe('AGENT');
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed token', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 5: Run to verify fail, then pass**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/api test
pnpm --filter @supportops/api typecheck
```

Expected: the `me` spec FAILS before Steps 1–3, then all api specs PASS; typecheck exits 0. Root lint and format clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): guarded GET /auth/me returning a user DTO

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Seed real credentials so the app is loginable (TDD)

**Files:**

- Modify: `packages/db/package.json` (add `@node-rs/argon2` dependency), `packages/db/src/seed.ts` (hash real passwords)
- Test: `packages/db/test/seed.spec.ts` (assert the seeded owner verifies)

**Interfaces:**

- Consumes: `hash`/`verify` from `@node-rs/argon2` (the same argon2id scheme `@supportops/auth` verifies against).
- Produces: seeded users whose `passwordHash` is a real argon2id hash of a documented development password, so the running app can authenticate them.

> **Why argon2 directly here, not `@supportops/auth`:** `@supportops/auth` depends on
> `@supportops/db` for the `Role` type, so importing `@supportops/auth` from the seed
> would create a `db ↔ auth` package cycle (Turborepo rejects cycles). The seed instead
> hashes with the same argon2id library the auth verifier uses, keeping the graph acyclic.

- [ ] **Step 1: Add the argon2 dependency to the db package**

In `packages/db/package.json`, add to `dependencies`:

```json
    "@node-rs/argon2": "^2.0.0"
```

Then:

```bash
cd /home/victor/Documents/coding/supportops
pnpm install
```

Expected: the workspace links `@node-rs/argon2` into `@supportops/db`.

- [ ] **Step 2: Hash real passwords in the seed**

In `packages/db/src/seed.ts`, add the import at the top:

```ts
import { hash } from '@node-rs/argon2';
```

Add a shared development password constant just inside `seed`, and replace every
`passwordHash: 'seed-not-a-real-hash'` with `passwordHash: await hash(DEV_PASSWORD)`:

```ts
export async function seed(prisma: PrismaClient): Promise<void> {
  // Shared password for every seeded account in local development.
  // Hashed with argon2id — the scheme @supportops/auth verifies against at login.
  const DEV_PASSWORD = 'supportops-dev';
  // ...existing upserts, each now using: passwordHash: await hash(DEV_PASSWORD)
}
```

- [ ] **Step 3: Extend the seed test (TDD)**

Add to `packages/db/test/seed.spec.ts` (import `verify` at the top):

```ts
import { verify } from '@node-rs/argon2';
```

```ts
  it('hashes real, verifiable passwords for seeded accounts', async () => {
    await seed(testPrisma);
    const owner = await testPrisma.user.findFirstOrThrow({ where: { email: 'owner@acme.test' } });
    expect(owner.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verify(owner.passwordHash, 'supportops-dev')).toBe(true);
  });
```

- [ ] **Step 4: Run to verify fail, then pass**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/db test
```

Expected: the new case FAILS against the placeholder hash, then PASSES once Step 2 lands. Existing seed cases stay green. Then re-seed the dev database end to end:

```bash
DATABASE_URL=postgres://supportops:supportops@localhost:5432/supportops \
  pnpm --filter @supportops/db exec prisma db seed
```

Expected: seed runs without error and remains idempotent.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): seed real argon2id password hashes for dev accounts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: CI — run the API integration tests deterministically

**Files:**

- Modify: `.github/workflows/ci.yml` (add `JWT_SECRET` and `REDIS_URL` to the job env)

**Interfaces:**

- Consumes: the existing Postgres service and `TEST_DATABASE_URL` (Phase 2).
- Produces: a CI run where `pnpm test` executes the API integration tests with an explicit signing secret and Redis URL, alongside the existing package tests.

- [ ] **Step 1: Add explicit auth env to the build job**

In `.github/workflows/ci.yml`, extend the existing `env:` block on the `build` job so it reads:

```yaml
    env:
      TEST_DATABASE_URL: postgres://supportops:supportops@localhost:5432/supportops_test
      JWT_SECRET: ci-only-secret-at-least-16-chars
      REDIS_URL: redis://localhost:6379
```

(No Redis service is needed yet — Phase 3 does not connect to Redis; the URL only satisfies config validation. The API test harness maps `DATABASE_URL` from `TEST_DATABASE_URL`.)

- [ ] **Step 2: Reproduce the full CI pipeline locally**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all exit 0; the run builds every workspace package in dependency order and executes the `config`, `db`, `auth`, and `api` test suites — the API integration tests included — against the local Postgres exactly as CI will.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "ci: provide explicit auth env for the api integration tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Document the architecture we follow

**Files:**

- Create: `docs/architecture.md`
- Modify: `README.md` (add a short "Architecture" pointer)

**Interfaces:**

- Consumes: nothing (documentation reflecting the now-real structure).
- Produces: a single overview a new contributor reads to understand how the monorepo fits together and where new code goes.

- [ ] **Step 1: Write the architecture overview**

`docs/architecture.md`:

```markdown
# Architecture

SupportOps is a TypeScript monorepo (pnpm workspaces + Turborepo). Code is split into
**apps** (deployable processes) and **packages** (shared libraries); `workers/` holds
background processors. Turborepo builds packages before the apps that depend on them.

## Layout

- `packages/config` — typed, validated environment configuration (`loadConfig`).
- `packages/db` — the Prisma schema, migrations, a shared `PrismaClient`, and the seed.
  Every model, enum, and type is re-exported from `@supportops/db`.
- `packages/auth` — password hashing (argon2id), JWT verification, and the
  authorization primitives (`JwtAuthGuard`, `RolesGuard`, `@Roles`, `@CurrentUser`,
  `@CurrentOrg`). Framework-aware but domain-agnostic.
- `apps/api` — the NestJS HTTP API.

## Request flow

Every request follows one shape:

```

Controller  →  Service  →  Prisma (@supportops/db)

```

- **Controllers** parse and validate input (`class-validator` DTOs via a global
  `ValidationPipe`), apply guards, and shape responses. They never touch the database.
- **Services** hold the business logic and are the only place the Prisma client is used.
- **Prisma** is reached exclusively through the shared client in `@supportops/db`.

Errors are thrown as typed domain errors and mapped to HTTP status codes by a global
exception filter, so services express meaning rather than transport concerns and no
internal detail leaks to clients.

## Authentication & authorization

The API is stateless. `POST /auth/login` resolves the tenant by organization slug,
verifies the password, and returns a short-lived access JWT carrying `{ sub, org, role }`.
Protected routes use `JwtAuthGuard`, which verifies the token and attaches a typed
principal; role-restricted routes add `RolesGuard` with `@Roles(...)`. Handlers read the
caller via `@CurrentUser()` / `@CurrentOrg()`. Every data access is organization-scoped.

## Multi-tenancy

Organizations are the tenant boundary. Tenant-scoped tables carry an indexed `org_id`,
and every query filters by it; a user's email is unique only within their organization.

## Testing

Unit tests are co-located `*.spec.ts` files. Integration tests run against a real
PostgreSQL: a per-package harness creates and migrates a dedicated `supportops_test`
database, and API endpoints are exercised end to end with `supertest`. The same
`typecheck` / `lint` / `test` commands run locally and in CI.
```

- [ ] **Step 2: Add a README pointer**

In `README.md`, add a short section (place it after the existing stack description):

```markdown
## Architecture

See [`docs/architecture.md`](./docs/architecture.md) for how the monorepo fits together
and where new code goes.
```

- [ ] **Step 3: Verify formatting and commit**

```bash
cd /home/victor/Documents/coding/supportops
pnpm exec prettier --check "**/*.md"
```

Expected: the docs are reported as formatted (run `--write` then re-check if not).

```bash
git add -A
git commit -m "docs: describe the monorepo architecture and request flow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Definition of done (Phase 3)

- `@supportops/auth` provides argon2id password hashing, JWT verification, `JwtAuthGuard`,
  `RolesGuard`, and the `@Roles`/`@CurrentUser`/`@CurrentOrg` decorators, each unit-tested.
- `apps/api` boots as a NestJS app with a global validation pipe and exception filter and
  exposes `GET /health`, `POST /auth/login` (tenant-aware, stateless access token), and a
  guarded `GET /auth/me` that returns a DTO and never leaks `passwordHash`.
- Login cannot enumerate accounts: unknown org, unknown email, and wrong password all
  return `401` with constant work.
- The seed produces real argon2id password hashes, so seeded accounts can log in with the
  documented development password.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test` are green locally and in CI, with the API
  integration tests running against a real Postgres.
- ADRs 0007 and 0008 and `docs/architecture.md` record the decisions and the shape of the
  system.
- Delivered as a reviewed PR (feature branch → `develop`); merging stays a human decision.

## Not in Phase 3 (later phases)

Domain modules (organizations, users, teams, customers, tickets, comments) and their
CRUD, the `packages/notifications` transport and `packages/queue` with the
`notification-worker`, and the `apps/web` Next.js client. `RolesGuard` ships and is
unit-tested here; it is first exercised over HTTP by the role-restricted domain routes of
the next phase.
