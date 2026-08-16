# Phase 2 — Data Layer (`packages/db`)

> Executed task by task. Each task is a small, independently testable slice that ends green — tests, lint, and typecheck all passing — before the next begins. Steps use checkboxes (`- [ ]`) for tracking.

**Goal:** Add `@supportops/db` — the Prisma schema for the whole domain, an initial migration, a shared client, a seed, and integration tests against a real Postgres — so every later package and app has a typed, migrated data layer to build on.

**Architecture:** One Prisma schema under `packages/db/prisma/schema.prisma` models the entire domain (organizations, users, teams, customers, tickets, comments, notifications) as Postgres tables and enums. `packages/db/src/index.ts` exports a single shared `PrismaClient` plus the generated types. Migrations are committed SQL applied with `prisma migrate deploy`. Integration tests run against a dedicated `supportops_test` database that the test harness creates and migrates.

**Tech Stack:** Prisma 5 + `@prisma/client`, PostgreSQL 16, Vitest 2, `pg` (test-database bootstrap), `tsx` (seed execution), TypeScript 5.5.

## Global Constraints

- **Every table** has `id`, `created_at`, `updated_at`. Tables and columns are `snake_case` via `@@map`/`@map`; Prisma models are `PascalCase`.
- **Fixed-value columns are Postgres enums**, never free-form `varchar`.
- **Timestamps are `timestamptz` in UTC** (`@db.Timestamptz(6)`). No naive local times.
- **Primary keys are UUIDs** (`@db.Uuid`, `@default(uuid())`); `password_hash` and raw UUIDs are internal and never assumed to be serialized.
- **Migrations are explicit and committed.** Schema changes ship as a reviewed migration; the migration directory is source-controlled.
- **Org scoping** is a query-time concern handled in services later; the schema gives every org-scoped table an indexed `org_id` foreign key to make that cheap and correct.
- **Prisma stays in the data layer and services** — never in controllers or DTOs.
- **Tests are non-optional.** The schema, client, and seed each ship with an integration test that runs against a real Postgres.
- Node `>=20` (local and CI run Node 24); pnpm only; commits carry `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; work lands on `develop`.

---

### Task 1: Scaffold `@supportops/db` and model the full schema

**Files:**

- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/prisma/schema.prisma`

**Interfaces:**

- Consumes: `tsconfig.base.json` (Phase 1); a reachable Postgres only from Task 2 onward (not needed here).
- Produces: the `@supportops/db` package and the complete Prisma schema; `prisma generate` yields `@prisma/client` typed to every model and enum, re-exported from `@supportops/db` in Task 3.

- [ ] **Step 1: Write the package manifest and tsconfig**

`packages/db/package.json`:

```json
{
  "name": "@supportops/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "scripts": {
    "postinstall": "prisma generate",
    "generate": "prisma generate",
    "build": "prisma generate && tsc -p tsconfig.json",
    "test": "vitest run",
    "lint": "eslint .",
    "typecheck": "prisma generate && tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "@prisma/client": "^5.22.0" },
  "devDependencies": {
    "@types/pg": "^8.11.6",
    "pg": "^8.12.0",
    "prisma": "^5.22.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

`packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 2: Write the Prisma schema**

`packages/db/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  OWNER
  ADMIN
  TEAM_LEAD
  AGENT

  @@map("role")
}

enum TicketStatus {
  OPEN
  PENDING
  RESOLVED
  CLOSED

  @@map("ticket_status")
}

enum TicketPriority {
  LOW
  NORMAL
  HIGH
  CRITICAL

  @@map("ticket_priority")
}

enum AuthorType {
  AGENT
  CUSTOMER

  @@map("author_type")
}

enum NotificationType {
  TICKET_ASSIGNED
  TICKET_COMMENTED

  @@map("notification_type")
}

enum NotificationChannel {
  EMAIL

  @@map("notification_channel")
}

enum NotificationStatus {
  PENDING
  SENT
  FAILED

  @@map("notification_status")
}

model Organization {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  slug      String   @unique
  timezone  String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  users         User[]
  teams         Team[]
  customers     Customer[]
  tickets       Ticket[]
  notifications Notification[]

  @@map("organizations")
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  orgId        String   @map("org_id") @db.Uuid
  email        String
  name         String
  role         Role
  teamId       String?  @map("team_id") @db.Uuid
  passwordHash String   @map("password_hash")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization    Organization   @relation(fields: [orgId], references: [id], onDelete: Cascade)
  team            Team?          @relation("TeamMembers", fields: [teamId], references: [id])
  ledTeams        Team[]         @relation("TeamLead")
  assignedTickets Ticket[]       @relation("TicketAssignee")
  notifications   Notification[]

  @@unique([orgId, email])
  @@index([orgId])
  @@map("users")
}

model Team {
  id         String   @id @default(uuid()) @db.Uuid
  orgId      String   @map("org_id") @db.Uuid
  name       String
  leadUserId String   @map("lead_user_id") @db.Uuid
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  lead         User         @relation("TeamLead", fields: [leadUserId], references: [id])
  members      User[]       @relation("TeamMembers")
  tickets      Ticket[]

  @@unique([orgId, name])
  @@index([orgId])
  @@map("teams")
}

model Customer {
  id        String   @id @default(uuid()) @db.Uuid
  orgId     String   @map("org_id") @db.Uuid
  email     String
  name      String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  tickets      Ticket[]

  @@unique([orgId, email])
  @@index([orgId])
  @@map("customers")
}

model Ticket {
  id          String         @id @default(uuid()) @db.Uuid
  orgId       String         @map("org_id") @db.Uuid
  customerId  String         @map("customer_id") @db.Uuid
  assigneeId  String?        @map("assignee_id") @db.Uuid
  teamId      String?        @map("team_id") @db.Uuid
  subject     String
  description String
  status      TicketStatus   @default(OPEN)
  priority    TicketPriority @default(NORMAL)
  createdAt   DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime       @updatedAt @map("updated_at") @db.Timestamptz(6)
  closedAt    DateTime?      @map("closed_at") @db.Timestamptz(6)

  organization Organization    @relation(fields: [orgId], references: [id], onDelete: Cascade)
  customer     Customer        @relation(fields: [customerId], references: [id])
  assignee     User?           @relation("TicketAssignee", fields: [assigneeId], references: [id])
  team         Team?           @relation(fields: [teamId], references: [id])
  comments     TicketComment[]

  @@index([orgId])
  @@index([orgId, status])
  @@map("tickets")
}

model TicketComment {
  id         String     @id @default(uuid()) @db.Uuid
  ticketId   String     @map("ticket_id") @db.Uuid
  authorType AuthorType @map("author_type")
  authorId   String     @map("author_id") @db.Uuid
  body       String
  isInternal Boolean    @default(false) @map("is_internal")
  createdAt  DateTime   @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime   @updatedAt @map("updated_at") @db.Timestamptz(6)

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId])
  @@map("ticket_comments")
}

model Notification {
  id        String              @id @default(uuid()) @db.Uuid
  orgId     String              @map("org_id") @db.Uuid
  userId    String              @map("user_id") @db.Uuid
  type      NotificationType
  channel   NotificationChannel
  payload   Json
  status    NotificationStatus  @default(PENDING)
  sentAt    DateTime?           @map("sent_at") @db.Timestamptz(6)
  createdAt DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([orgId])
  @@index([userId])
  @@map("notifications")
}
```

- [ ] **Step 3: Install, generate, and validate**

```bash
cd /home/victor/Documents/coding/supportops
pnpm install
pnpm --filter @supportops/db exec prisma validate
pnpm --filter @supportops/db exec prisma format
```

Expected: `pnpm install` links the package and runs its `postinstall` (`prisma generate`) cleanly; `prisma validate` prints "The schema is valid"; `prisma format` leaves the schema unchanged (already formatted). Run `pnpm exec prettier --check .` and `pnpm exec eslint .` at the root — both clean (Prisma files are outside Prettier's parsers and eslint's TS globs).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): add @supportops/db package and domain schema

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Initial migration

**Files:**

- Create: `packages/db/prisma/migrations/**` (generated), `packages/db/prisma/migrations/migration_lock.toml`

**Interfaces:**

- Consumes: the schema from Task 1; a running Postgres (from Phase 1's `docker-compose.yml`).
- Produces: a committed `init` migration that creates every enum type and table with `snake_case` names and `timestamptz` columns. `prisma migrate deploy` reproduces the schema on any empty database.

- [ ] **Step 1: Start Postgres**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
```

Expected: the `postgres` container is running and accepting connections on `localhost:5432`.

- [ ] **Step 2: Generate and apply the initial migration**

```bash
DATABASE_URL=postgres://supportops:supportops@localhost:5432/supportops \
  pnpm --filter @supportops/db exec prisma migrate dev --name init
```

Expected: Prisma creates `prisma/migrations/<timestamp>_init/migration.sql`, applies it to the `supportops` database, and regenerates the client. The command reports the migration as applied.

- [ ] **Step 3: Verify the migration SQL honors the invariants**

```bash
cd /home/victor/Documents/coding/supportops
MIG=$(ls packages/db/prisma/migrations/*_init/migration.sql)
grep -c "CREATE TYPE" "$MIG"          # 7 enums
grep -c "timestamptz" "$MIG"          # every created_at/updated_at/closed_at/sent_at
grep -E "CREATE TABLE .*(organizations|ticket_comments|notifications)" "$MIG"
```

Expected: seven `CREATE TYPE` statements (the enums); many `timestamptz` columns; snake_case table names in the `CREATE TABLE` output. If any table is missing `created_at`/`updated_at`, fix the schema and regenerate before committing.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): initial migration for the domain schema

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Shared client + integration test harness (TDD)

**Files:**

- Create: `packages/db/src/index.ts`, `packages/db/vitest.config.ts`, `packages/db/test/global-setup.ts`, `packages/db/test/client.ts`
- Test: `packages/db/test/schema.spec.ts`

**Interfaces:**

- Consumes: the generated client and committed migrations (Tasks 1–2).
- Produces: `import { prisma } from '@supportops/db'` — a single shared `PrismaClient` reading `DATABASE_URL`; all generated model types and enums are re-exported from `@supportops/db`. Also produces the reusable test harness (`testPrisma`, `resetDb`) that later packages' integration tests reuse.

- [ ] **Step 1: Write the test harness**

`packages/db/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // Integration tests share one database; run files serially to avoid interference.
    fileParallelism: false,
  },
});
```

`packages/db/test/global-setup.ts`:

```ts
import { execSync } from 'node:child_process';
import { Client } from 'pg';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://supportops:supportops@localhost:5432/supportops_test';

export default async function setup() {
  // Ensure the dedicated test database exists (connect to the maintenance db).
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbName}"`);
  } catch (err) {
    // 42P04 = duplicate_database; anything else is a real failure.
    if ((err as { code?: string }).code !== '42P04') throw err;
  } finally {
    await client.end();
  }

  // Apply committed migrations to the test database.
  execSync('prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
```

`packages/db/test/client.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://supportops:supportops@localhost:5432/supportops_test';

export const testPrisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

/** Empty every domain table between tests. CASCADE clears dependent rows. */
export async function resetDb() {
  await testPrisma.$executeRawUnsafe(
    'TRUNCATE TABLE notifications, ticket_comments, tickets, customers, teams, users, organizations RESTART IDENTITY CASCADE',
  );
}
```

- [ ] **Step 2: Write the failing integration test**

`packages/db/test/schema.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { testPrisma, resetDb } from './client.js';

beforeEach(resetDb);
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('domain schema', () => {
  it('persists an org, agent, customer, and ticket with enum defaults', async () => {
    const org = await testPrisma.organization.create({
      data: { name: 'Acme Support', slug: 'acme', timezone: 'UTC' },
    });
    const agent = await testPrisma.user.create({
      data: {
        orgId: org.id,
        email: 'ada@acme.test',
        name: 'Ada Lovelace',
        role: 'AGENT',
        passwordHash: 'not-a-real-hash',
      },
    });
    const customer = await testPrisma.customer.create({
      data: { orgId: org.id, email: 'cara@customer.test', name: 'Cara' },
    });
    const ticket = await testPrisma.ticket.create({
      data: {
        orgId: org.id,
        customerId: customer.id,
        assigneeId: agent.id,
        subject: 'Cannot log in',
        description: 'The password reset link loops back to the login page.',
      },
    });

    expect(ticket.status).toBe('OPEN'); // enum default
    expect(ticket.priority).toBe('NORMAL'); // enum default
    expect(ticket.closedAt).toBeNull();
    expect(ticket.createdAt).toBeInstanceOf(Date);

    const found = await testPrisma.ticket.findFirstOrThrow({
      where: { orgId: org.id },
      include: { assignee: true, customer: true },
    });
    expect(found.assignee?.role).toBe('AGENT');
    expect(found.customer.email).toBe('cara@customer.test');
  });

  it('enforces one email per customer per organization', async () => {
    const org = await testPrisma.organization.create({
      data: { name: 'Acme', slug: 'acme', timezone: 'UTC' },
    });
    await testPrisma.customer.create({
      data: { orgId: org.id, email: 'dup@customer.test', name: 'First' },
    });
    await expect(
      testPrisma.customer.create({
        data: { orgId: org.id, email: 'dup@customer.test', name: 'Second' },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/db test
```

Expected: FAIL — the suite cannot resolve `./client.js` / harness wiring until Step 1's files are in place and the client is generated; once the harness resolves, the test drives the schema. (If the harness files already exist from Step 1, the first red is the missing shared client export added next.)

- [ ] **Step 4: Write the shared client export**

`packages/db/src/index.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Process-wide singleton so dev/hot-reload never opens a new pool per import. */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export the generated client types and enums for consumers.
export * from '@prisma/client';
```

- [ ] **Step 5: Run the test and typecheck to verify green**

```bash
pnpm --filter @supportops/db test
pnpm --filter @supportops/db typecheck
```

Expected: both tests PASS against `supportops_test` (auto-created and migrated by `global-setup`); typecheck exits 0. Root `pnpm exec prettier --check .` and `pnpm exec eslint .` are clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): shared prisma client and integration test harness

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Seed data

**Files:**

- Create: `packages/db/src/seed.ts`, `packages/db/prisma/seed.ts`
- Test: `packages/db/test/seed.spec.ts`

**Interfaces:**

- Consumes: the client and harness (Task 3).
- Produces: `seed(prisma)` — an idempotent function that fills an organization with teams, agents, customers, tickets, and comments; `prisma/seed.ts` runs it against `DATABASE_URL` via `prisma db seed`.

- [ ] **Step 1: Write the seed function**

`packages/db/src/seed.ts`:

```ts
import { PrismaClient } from '@prisma/client';

/** Idempotent: safe to run repeatedly against the same database. */
export async function seed(prisma: PrismaClient): Promise<void> {
  const org = await prisma.organization.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { name: 'Acme Support', slug: 'acme', timezone: 'Europe/Paris' },
  });

  await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: 'owner@acme.test' } },
    update: {},
    create: {
      orgId: org.id,
      email: 'owner@acme.test',
      name: 'Olivia Owner',
      role: 'OWNER',
      passwordHash: 'seed-not-a-real-hash',
    },
  });

  const lead = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: 'lead@acme.test' } },
    update: {},
    create: {
      orgId: org.id,
      email: 'lead@acme.test',
      name: 'Leo Lead',
      role: 'TEAM_LEAD',
      passwordHash: 'seed-not-a-real-hash',
    },
  });

  const team = await prisma.team.upsert({
    where: { orgId_name: { orgId: org.id, name: 'Tier 1' } },
    update: {},
    create: { orgId: org.id, name: 'Tier 1', leadUserId: lead.id },
  });

  const agent = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: 'ada@acme.test' } },
    update: {},
    create: {
      orgId: org.id,
      email: 'ada@acme.test',
      name: 'Ada Agent',
      role: 'AGENT',
      teamId: team.id,
      passwordHash: 'seed-not-a-real-hash',
    },
  });

  const customer = await prisma.customer.upsert({
    where: { orgId_email: { orgId: org.id, email: 'cara@customer.test' } },
    update: {},
    create: { orgId: org.id, email: 'cara@customer.test', name: 'Cara Customer' },
  });

  const existing = await prisma.ticket.findFirst({
    where: { orgId: org.id, subject: 'Cannot log in' },
  });
  if (!existing) {
    await prisma.ticket.create({
      data: {
        orgId: org.id,
        customerId: customer.id,
        assigneeId: agent.id,
        teamId: team.id,
        subject: 'Cannot log in',
        description: 'The password reset link loops back to the login page.',
        priority: 'HIGH',
        comments: {
          create: [
            {
              authorType: 'CUSTOMER',
              authorId: customer.id,
              body: 'Still stuck after three tries.',
            },
            {
              authorType: 'AGENT',
              authorId: agent.id,
              body: 'Looking into it now.',
              isInternal: false,
            },
          ],
        },
      },
    });
  }

  // Reference owner so linters see it used; owners seed real orgs in later phases.
  void owner;
}
```

`packages/db/prisma/seed.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { seed } from '../src/seed.js';

const prisma = new PrismaClient();

seed(prisma)
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Write the failing seed test**

`packages/db/test/seed.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { testPrisma, resetDb } from './client.js';
import { seed } from '../src/seed.js';

beforeEach(resetDb);
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('seed', () => {
  it('creates a lived-in organization', async () => {
    await seed(testPrisma);

    const org = await testPrisma.organization.findUniqueOrThrow({ where: { slug: 'acme' } });
    expect(await testPrisma.user.count({ where: { orgId: org.id } })).toBeGreaterThanOrEqual(3);
    expect(await testPrisma.ticket.count({ where: { orgId: org.id } })).toBeGreaterThanOrEqual(1);

    const ticket = await testPrisma.ticket.findFirstOrThrow({
      where: { orgId: org.id },
      include: { comments: true },
    });
    expect(ticket.comments.length).toBeGreaterThanOrEqual(2);
  });

  it('is idempotent', async () => {
    await seed(testPrisma);
    await seed(testPrisma);
    expect(await testPrisma.organization.count({ where: { slug: 'acme' } })).toBe(1);
  });
});
```

- [ ] **Step 3: Run to verify fail, then pass**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm --filter @supportops/db test -- seed
```

Expected: initially FAIL (`../src/seed.js` not found) before Step 1's files exist; after they exist, both cases PASS. Then confirm the CLI path end to end against the dev database:

```bash
DATABASE_URL=postgres://supportops:supportops@localhost:5432/supportops \
  pnpm --filter @supportops/db exec prisma db seed
```

Expected: seed runs without error; re-running it changes no counts (idempotent).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): idempotent seed for a lived-in organization

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: CI — Postgres service for integration tests

**Files:**

- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: the integration tests (Tasks 3–4) and committed migrations (Task 2).
- Produces: a CI job with a Postgres service so `pnpm test` runs the data-layer integration tests; the test harness creates and migrates `supportops_test` inside the service.

- [ ] **Step 1: Add a Postgres service to the build job**

Replace `.github/workflows/ci.yml` with:

```yaml
name: CI
on:
  push:
    branches: [develop]
  pull_request:
    branches: [develop, main]
jobs:
  build:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: supportops
          POSTGRES_PASSWORD: supportops
          POSTGRES_DB: supportops
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U supportops"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      TEST_DATABASE_URL: postgres://supportops:supportops@localhost:5432/supportops_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Step 2: Reproduce the CI test step locally**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three commands exit 0; the data-layer integration tests run against `supportops_test` on the local Postgres exactly as they will in CI.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "ci: run integration tests against a postgres service

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Definition of done (Phase 2)

- `@supportops/db` exports a shared `prisma` client and re-exports the generated model types and enums.
- The schema covers every domain entity with `snake_case` tables, Postgres enums, UUID keys, and `timestamptz` `created_at`/`updated_at` on every table.
- A committed `init` migration reproduces the schema on an empty database via `prisma migrate deploy`.
- `pnpm --filter @supportops/db test` passes against a real Postgres; the seed is idempotent.
- CI provisions Postgres and runs the integration tests green.
- Delivered as a reviewed PR (`develop → main`); merging stays a human decision.

## Not in Phase 2 (later phases)

Auth (`packages/auth`), the Nest application and its domain modules (`apps/api`), the notifications transport and queue worker, and the web app (`apps/web`). Org-scoping enforcement and DTO mapping arrive with the services that own those queries.
