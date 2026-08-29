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
- `packages/queue` — BullMQ-over-Redis plumbing: a typed job, a Redis connection
  factory, and producer/worker factories. Knows nothing of the database or of how a
  notification is delivered.
- `packages/notifications` — the notification domain: a `Transport` interface with a
  `ConsoleTransport`, a pure message renderer, a `NotificationService` that records a
  notification and enqueues its delivery, and a `deliverNotification` consumer.
- `apps/api` — the NestJS HTTP API.
- `apps/web` — the Next.js web client agents use to work tickets.
- `workers/notification-worker` — a background process that consumes delivery jobs and
  sends each notification through the transport.

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

## Notifications

Notifications are delivered asynchronously so an agent action never waits on — or
fails because of — message delivery. When a ticket is assigned to an agent or gains a
comment, the service records a `Notification` row (status `PENDING`) and enqueues a
delivery job carrying only that row's id. `workers/notification-worker` consumes the
job, renders the message, sends it through a `Transport` (a console transport today,
shaped so a real email transport drops in later), and marks the row `SENT` or
`FAILED`. Recording the row is awaited; the enqueue is best-effort, so a Redis outage
degrades notifications without affecting ticket work. See
[ADR 0013](./adr/0013-asynchronous-notifications.md) and
[ADR 0014](./adr/0014-notification-triggers-and-recipients.md).

## Web client

`apps/web` is a Next.js App Router app and the only user-facing surface for the API;
it is a separate deployable that talks to the API over HTTP, never sharing a process
or a database connection with it. Two rules keep it thin:

- **Reads go through server components**, which call a single server-side client
  (`src/lib/http.ts` + `src/lib/api.ts`) as part of rendering the page. There is no
  client-side data-fetching layer for the initial view.
- **Mutations go through route handlers** under `apps/web/src/app/api/...`, which
  call the API on the browser's behalf.

The session is an httpOnly, `SameSite=Lax` cookie set by a login route handler after
it calls the API's login endpoint. Server components and route handlers read the
cookie and attach it as a `Bearer` header when calling the API; the browser never
holds the token and never calls the API directly. See
[ADR 0015](./adr/0015-web-client-next-app-router.md) and
[ADR 0016](./adr/0016-session-httponly-cookie-bff.md).

## Testing

Unit tests are co-located `*.spec.ts` files. Integration tests run against a real
PostgreSQL: a per-package harness creates and migrates a dedicated test database,
and API endpoints are exercised end to end with `supertest`. The same
`typecheck` / `lint` / `test` commands run locally and in CI.
