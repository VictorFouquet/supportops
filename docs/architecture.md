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

## Domain surface

The API manages a support desk's core records, each a feature module following the
request-flow shape above:

- **Organizations** — the tenant; the caller reads and updates its own organization.
- **Users** — the agents who staff the desk, with roles, team membership, and
  self-service profile and password changes.
- **Teams** — groups of agents, each with a lead.
- **Customers** — the people who raise tickets.
- **Tickets** — the unit of work: created against a customer, optionally assigned to
  an agent and/or team, and moved through a governed status lifecycle
  (`OPEN` → `PENDING` → `RESOLVED` → `CLOSED`, with reopen) that maintains `closedAt`.
  See [ADR 0011](./adr/0011-ticket-lifecycle-and-status-transitions.md).
- **Ticket comments** — a ticket's thread. Every comment is written by an
  authenticated agent, either as themselves or on the customer's behalf
  (`authorType`), and may be flagged as an internal, agent-only note. See
  [ADR 0012](./adr/0012-ticket-authorization-and-comments.md).

Collection endpoints share one page-based envelope (`{ data, page, pageSize, total }`)
with an optional `q` filter; the ticket list also filters by status, priority,
assignee, and team.

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
