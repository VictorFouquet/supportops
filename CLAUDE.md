# Contributing to SupportOps

House rules. These are enforced in review and CI. Treat them as invariants, not
preferences.

## Data & migrations

- Fixed-value columns use Postgres enums, never free-form `varchar`.
- Migrations are explicit and safe: no destructive change without a paired data
  migration; a migration that cannot map existing rows aborts rather than silently
  dropping them.
- Every table has `id`, `created_at`, `updated_at`. Tables and columns are
  `snake_case` (Prisma `@@map`); Prisma models are `PascalCase`.
- Timestamps are stored as `timestamptz` in UTC. No naive local times.

## API & security

- Every org-scoped query filters by `orgId`; no query crosses organizations.
- Every mutating route sits behind `RolesGuard`. There are no unguarded write endpoints.
- Prisma is used only inside `*.service.ts`. Controllers and DTOs never touch the client.
- Responses are built from DTOs. Internal UUIDs used as enum keys and `passwordHash`
  are never serialized.

## Testing

- Every service method has a co-located unit test.
- Every endpoint has an integration test.

## Conventions

- Files kebab-case; classes/types PascalCase; env vars SCREAMING_SNAKE.
- One NestJS module per domain; `Controller → Service → Prisma`.

## Background work

- Background jobs go through `packages/queue` (BullMQ). Workers live in `workers/`.
  Do not reach for a second scheduler or run background work inline in a request.
- A notification is recorded (a `Notification` row) and then enqueued; delivery
  happens in a worker through a `Transport`. A new notification kind registers a
  `NotificationType` and is rendered in `packages/notifications`.
- Emitting a notification is best-effort and must never fail the request that
  triggered it: persist the row, then enqueue without awaiting the result.
