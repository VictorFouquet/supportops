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

Controller → Service → Prisma (@supportops/db)

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
PostgreSQL: a per-package harness creates and migrates a dedicated test database,
and API endpoints are exercised end to end with `supertest`. The same
`typecheck` / `lint` / `test` commands run locally and in CI.
