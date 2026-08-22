# 0006 — Prisma commands receive DATABASE_URL explicitly

- **Status:** Accepted
- **Date:** 2026-08-16

## Context

Prisma resolves `env("DATABASE_URL")` by loading a `.env` from the command's working
directory and the schema directory — it does not walk up to the workspace root, where
our `.env` lives. Run inside `packages/db`, commands like `prisma validate`,
`prisma migrate`, and `prisma db seed` therefore fail with "Environment variable not
found: DATABASE_URL". Duplicating the URL into a `packages/db/.env` would drift from the
root, and that file is git-ignored so it would not exist on a fresh clone or in CI.

## Decision

Pass `DATABASE_URL` explicitly to every Prisma command; never rely on ambient `.env`
resolution inside the package.

- **Dev / migrations:** `DATABASE_URL=… pnpm --filter @supportops/db exec prisma <cmd>`
  against the development database.
- **Tests:** the Vitest `global-setup` sets `DATABASE_URL` to a dedicated
  `supportops_test` database for `migrate deploy`, and the test client connects to
  `TEST_DATABASE_URL`.
- **CI:** the job sets `TEST_DATABASE_URL`; a Postgres service provides the server.
- `prisma generate` needs no URL (it reads only the schema's structure) and runs from
  `postinstall`.

## Consequences

- No database URL is duplicated into the repository; fresh clones and CI work without a
  per-package `.env`.
- Every Prisma invocation names which database it touches, so tests can never
  accidentally run against the development database.
- Contributors run migrations with the `DATABASE_URL` prefix; this is shown wherever a
  migration command appears.
