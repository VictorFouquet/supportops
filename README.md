# SupportOps

A lightweight customer-support desk for small teams: organizations, agents, teams,
customers, and tickets with comments, assignment, and email notifications.

## Stack

TypeScript monorepo (pnpm + Turborepo). NestJS API, Next.js web, Prisma + Postgres,
BullMQ on Redis for background jobs.

## Architecture

See [`docs/architecture.md`](./docs/architecture.md) for how the monorepo fits together
and where new code goes.

## Getting started

```bash
pnpm install
docker compose up -d        # Postgres + Redis
cp .env.example .env
pnpm test
```

The API runs on port 3000. To run the web app alongside it, copy
[`apps/web/.env.example`](./apps/web/.env.example) to `apps/web/.env` (it points
`API_URL` at the running API) and start it on port 3001:

```bash
pnpm --filter @supportops/web dev
```

## Workspace

- `apps/web` — Next.js front end
- `apps/api` — NestJS REST API
- `packages/*` — shared libraries (`config`, `db`, `auth`, `notifications`, `queue`)
- `workers/*` — background job processors
