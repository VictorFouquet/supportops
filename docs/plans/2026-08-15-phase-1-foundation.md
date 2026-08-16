# Phase 1 — Foundation Implementation Plan

> Executed task by task. Each task is a small, independently testable slice that ends green — tests, lint, and typecheck all passing — before the next begins. Steps use checkboxes (`- [ ]`) for tracking.

**Goal:** Stand up the SupportOps monorepo skeleton — a pnpm + Turborepo TypeScript workspace with strict tooling, one tested `@supportops/config` package, local Postgres + Redis via docker-compose, and green CI.

**Architecture:** A pnpm workspace orchestrated by Turborepo, with `apps/*`, `packages/*`, and `workers/*` globs. Phase 1 creates only the root tooling and the first shared package (`packages/config`), so later phases (db, auth, api, web, worker) drop into an established, convention-bearing skeleton. All configuration is typed and validated at load time via zod.

**Tech Stack:** TypeScript 5.5 (strict), pnpm 9, Turborepo 2, Vitest 2, ESLint 9 (flat config) + typescript-eslint 8, Prettier 3, zod 3, Node 24 LTS, Postgres 16, Redis 7, GitHub Actions.

## Global Constraints

- **Repo location:** the SupportOps repo is created at `/home/victor/Documents/coding/supportops`. All paths below are relative to that repo root.
- **Commits:** conventional-commit style, and every commit carries the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Branching & review gate:** `main` is the protected integration branch — never pushed to directly. Every task's commit step commits to `develop`; integration into `main` is a reviewed PR (`develop → main`). Feature branches open PRs into `develop` as well, so both `develop` and `main` advance only through reviewed PRs.
- **Node:** `>=20` (LTS; local and CI run Node 24). **Package manager:** pnpm only (committed `pnpm-lock.yaml`; no `package-lock.json`/`yarn.lock`).
- **TypeScript:** `strict: true` and `noUncheckedIndexedAccess: true` everywhere via `tsconfig.base.json`.
- **Naming:** files kebab-case; classes/types PascalCase; env vars SCREAMING_SNAKE.
- **Tests are non-optional:** any module with logic ships a co-located `*.spec.ts`.
- **Package names:** internal packages are scoped `@supportops/<name>`.

---

### Task 1: Workspace scaffold + tooling + docs

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.gitignore`, `.nvmrc`, `README.md`, `CLAUDE.md`

**Interfaces:**

- Consumes: nothing (first task).
- Produces: root scripts `build`/`test`/`lint`/`typecheck` (each delegates to `turbo run <task>`); `tsconfig.base.json` for packages to extend; the workspace globs `apps/*`, `packages/*`, `workers/*`.

- [ ] **Step 1: Create and initialize the repo**

```bash
mkdir -p /home/victor/Documents/coding/supportops
cd /home/victor/Documents/coding/supportops
git init -q -b main
git config user.name "Victor Fouquet"
git config user.email "victorfouquet@gmail.com"
# main is the protected integration branch: give it a root commit, then do all work on develop
git commit -q --allow-empty -m "chore: initialize repository

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git checkout -q -b develop
```

All Phase 1 task commits below land on `develop`. `main` receives them only via the reviewed PR at the end (see **Delivery**).

- [ ] **Step 2: Write the root workspace + tooling files**

`package.json`:

```json
{
  "name": "supportops",
  "private": true,
  "packageManager": "pnpm@9.7.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@eslint/js": "^9.9.0",
    "eslint": "^9.9.0",
    "prettier": "^3.3.3",
    "turbo": "^2.0.14",
    "typescript": "^5.5.4",
    "typescript-eslint": "^8.2.0",
    "vitest": "^2.0.5"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'workers/*'
```

`turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["^build"] },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
```

`.prettierrc.json`:

```json
{ "semi": true, "singleQuote": true, "trailingComma": "all", "printWidth": 100 }
```

`.nvmrc`:

```
24
```

`.gitignore`:

```
node_modules/
dist/
.next/
coverage/
*.tsbuildinfo
.env
.env.*
!.env.example
.DS_Store
*.log
```

- [ ] **Step 3: Write `README.md`**

`README.md`:

````markdown
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
````

- [ ] **Step 4: Write `CLAUDE.md` (HARD engineering invariants)**

`CLAUDE.md`:

```markdown
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
```

- [ ] **Step 5: Install and verify tooling runs clean**

```bash
cd /home/victor/Documents/coding/supportops
pnpm install
pnpm exec prettier --check .
pnpm exec eslint .
```

Expected: `pnpm install` completes and writes `pnpm-lock.yaml`; prettier reports "All matched files use Prettier code style!"; eslint exits 0 with no output (nothing to lint yet). `pnpm typecheck`/`pnpm test`/`pnpm build` are no-ops that exit 0 (no packages yet).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm + turborepo workspace and tooling

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `@supportops/config` — typed, validated env config (TDD)

**Files:**

- Create: `packages/config/package.json`, `packages/config/tsconfig.json`, `packages/config/src/index.ts`
- Test: `packages/config/src/config.spec.ts`

**Interfaces:**

- Consumes: `tsconfig.base.json` (Task 1).
- Produces: `loadConfig(env?: NodeJS.ProcessEnv): AppConfig` and the `AppConfig` type, exported from `@supportops/config`. `AppConfig` fields: `NODE_ENV: 'development' | 'test' | 'production'`, `DATABASE_URL: string`, `REDIS_URL: string`, `JWT_SECRET: string`. Consumed by every later package/app that needs env.

- [ ] **Step 1: Write the package manifest and tsconfig**

`packages/config/package.json`:

```json
{
  "name": "@supportops/config",
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
  "dependencies": { "zod": "^3.23.8" },
  "devDependencies": { "typescript": "^5.5.4", "vitest": "^2.0.5" }
}
```

`packages/config/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 2: Write the failing test**

`packages/config/src/config.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from './index.js';

const valid = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/supportops',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a-sufficiently-long-secret',
} as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('parses a valid environment and defaults NODE_ENV to development', () => {
    const cfg = loadConfig(valid);
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.DATABASE_URL).toContain('postgres://');
    expect(cfg.REDIS_URL).toContain('redis://');
  });

  it('throws, naming the offending variable, when a required var is missing', () => {
    const { JWT_SECRET, ...missing } = valid as Record<string, string>;
    expect(() => loadConfig(missing as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
  });

  it('rejects a JWT secret that is too short', () => {
    expect(() => loadConfig({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /home/victor/Documents/coding/supportops
pnpm --filter @supportops/config test
```

Expected: FAIL — `Cannot find module './index.js'` (the implementation does not exist yet).

- [ ] **Step 4: Write the minimal implementation**

`packages/config/src/index.ts`:

```ts
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${detail}`);
  }
  return parsed.data;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @supportops/config test
pnpm --filter @supportops/config typecheck
```

Expected: all three tests PASS; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(config): typed, validated environment loader

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Local infrastructure — docker-compose + `.env.example`

**Files:**

- Create: `docker-compose.yml`, `.env.example`

**Interfaces:**

- Consumes: the `AppConfig` field names from Task 2 (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `NODE_ENV`).
- Produces: a runnable local Postgres 16 + Redis 7; `.env.example` whose values satisfy `loadConfig`.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: supportops
      POSTGRES_PASSWORD: supportops
      POSTGRES_DB: supportops
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
volumes:
  pgdata:
```

- [ ] **Step 2: Write `.env.example`**

```
NODE_ENV=development
DATABASE_URL=postgres://supportops:supportops@localhost:5432/supportops
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-only-change-me-please
```

- [ ] **Step 3: Verify the compose file and that the example env satisfies config**

```bash
cd /home/victor/Documents/coding/supportops
docker compose config -q && echo "compose OK"
```

Expected: `compose OK`. (Env-example validity is guaranteed by the field names matching Task 2's schema; build `@supportops/config` and load `.env.example` through `loadConfig` if you want to confirm it end to end.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: local Postgres and Redis via docker-compose

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Continuous integration

**Files:**

- Create: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: root scripts `typecheck`/`lint`/`test` (Task 1).
- Produces: a CI pipeline that runs on every push to `develop` and on every PR targeting `develop` or `main`.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:

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

- [ ] **Step 2: Reproduce the CI steps locally to verify green**

```bash
cd /home/victor/Documents/coding/supportops
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
```

Expected: install succeeds against the committed lockfile; typecheck, lint, and test all exit 0 (config's 3 tests pass).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "ci: typecheck, lint, and test on develop pushes and PRs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Definition of done (Phase 1)

- `pnpm install` is reproducible from a committed `pnpm-lock.yaml`.
- `pnpm typecheck && pnpm lint && pnpm test` all pass; `@supportops/config` has passing unit tests.
- `docker compose up -d` brings up Postgres + Redis; `.env.example` copies to a working `.env`.
- `README.md` and `CLAUDE.md` are present and accurate.
- CI workflow is present and green on the same commands.
- Phase 1 is delivered as a reviewed PR (`develop → main`), not a direct push to `main` (see **Delivery**).

## Delivery — the human review gate

Phase 1 is not "done" until it has passed review as a PR. After Task 4, on `develop`:

1. Publish both branches to the remote (`main` is the protected base; `develop` carries the work):

```bash
cd /home/victor/Documents/coding/supportops
git remote add origin https://github.com/VictorFouquet/supportops.git
git push -u origin main       # protected base (empty root commit)
git push -u origin develop    # all Phase 1 work
```

2. Protect `main` so it advances only through reviewed PRs with green CI — configure in the GitHub UI (**Settings → Branches**: require a PR before merging, require the `build` status check). As the solo maintainer you are both author and merger; the point is that nothing reaches `main` without a PR and a passing pipeline.

3. Open the integration PR:

```bash
gh pr create --base main --head develop \
  --title "Foundation: pnpm + Turborepo workspace" \
  --body "Workspace scaffold, @supportops/config, local Postgres + Redis, and CI."
```

4. **Human gate:** review the PR, confirm CI is green, merge. Merging `main` is always a human decision.

## Not in Phase 1 (later phases)

Prisma schema/migrations/seed (`packages/db`), auth (`packages/auth`), the Nest app and domains (`apps/api`), notifications/queue/worker, and the Next.js app (`apps/web`).
