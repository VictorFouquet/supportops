# SupportOps

A lightweight customer-support desk for small teams: organizations, agents, teams,
customers, and tickets with comments, assignment, and email notifications.

## Stack

TypeScript monorepo (pnpm + Turborepo). NestJS API, Next.js web, Prisma + Postgres,
BullMQ on Redis for background jobs.

## Getting started

```bash
pnpm install
docker compose up -d        # Postgres + Redis
cp .env.example .env
pnpm test
```

## Workspace

- `apps/web` — Next.js front end
- `apps/api` — NestJS REST API
- `packages/*` — shared libraries (`config`, `db`, `auth`, `notifications`, `queue`)
- `workers/*` — background job processors
