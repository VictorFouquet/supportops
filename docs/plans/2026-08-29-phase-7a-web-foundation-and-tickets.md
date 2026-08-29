# Phase 7a — Web foundation & the agent ticket workflow

> Executed task by task. Each task is a small, independently testable slice that ends green — tests, lint, and typecheck all passing — before the next begins. Steps use checkboxes (`- [ ]`) for tracking.

**Goal:** Give SupportOps its first human-facing surface: a Next.js web app where an agent logs in, browses and filters tickets, opens a ticket to read its thread, and changes status, assignment, and adds comments. This slice covers authentication, the app shell, the ticket list, and the ticket detail; the settings/admin screens follow in a later phase.

**Architecture:** A new `apps/web` on the Next.js App Router. It talks to the existing HTTP API through a **server-side backend-for-frontend**: the JWT lives in an httpOnly cookie the browser never reads, and every API call is made from the Next server (server components and route handlers), which attaches the `Bearer` header. The browser only ever talks to its own origin, so the API needs no CORS change. Data is read in server components; mutations post to small route handlers that call the API and revalidate.

**Tech Stack:** Next.js 15 (App Router) + React 19, TypeScript 5.5 (ESM), Tailwind CSS v4, Vitest 2 + Testing Library + jsdom, pnpm + Turborepo. The app consumes the existing NestJS API unchanged.

**Spec:** none in this repository — the requirements are captured in the ADRs written in Task 1 (`docs/adr/0015`, `docs/adr/0016`) and in `docs/architecture.md`.

## Global Constraints

- **The browser never holds the token.** The JWT is stored only in an httpOnly, `SameSite=Lax`, `Secure`-in-production cookie. No token in `localStorage`, no token in any client component, no direct browser→API call. Every API request originates on the Next server.
- **One path to the API.** All API access goes through `src/lib/http.ts` (the low-level request) and `src/lib/api.ts` (typed, session-aware calls). No `fetch` to the API from anywhere else; no second client.
- **The API is unchanged.** This phase adds and modifies nothing under `apps/api`, `packages/`, or `workers/`. It consumes only endpoints that already exist.
- **Timestamps arrive as strings.** JSON has no `Date`; every timestamp field on a web-side type is `string` (an ISO-8601 value), formatted for display, never `new Date()`-diffed for business logic.
- **Tests are network-free.** No test performs real I/O. `src/lib/http.ts` is tested against a stubbed `fetch`; higher layers mock `./http.js` / `./session.js` / `./api.js`; components are rendered with Testing Library. CI runs no browser and no live API.
- **ESM everywhere.** `"type": "module"`; all relative and `@/`-alias imports carry `.js` extensions in both `.ts` and `.tsx` files (resolved to the `.ts`/`.tsx` source via `extensionAlias` in `next.config.ts` and via Vite in tests), matching the rest of the workspace. The web `tsconfig` uses `moduleResolution: bundler` and does **not** extend `tsconfig.base.json` — Next's compiler options differ.
- **Files kebab-case; React components PascalCase; hooks/functions camelCase.** One responsibility per file; UI primitives under `src/components/ui`, feature components under `src/components/tickets`.
- Node `>=20` (local and CI run Node 24); pnpm only (9.7.0); commits carry `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; work lands on `develop` via a feature branch (`feat/web-foundation-and-tickets`) and PR.

---

### Task 1: Record the web-client decisions (ADRs 0015, 0016)

**Files:**

- Create: `docs/adr/0015-web-client-next-app-router.md`, `docs/adr/0016-session-httponly-cookie-bff.md`
- Modify: `docs/adr/README.md` (append two rows)

**Interfaces:**

- Consumes: nothing (documentation).
- Produces: the accepted decisions the rest of the phase implements — a separate Next.js App Router client (0015), and a server-side BFF that keeps the JWT in an httpOnly cookie (0016).

**Acceptance:** two new ADRs in `Accepted` status, indexed in the README, describing (a) why the web client is a separate Next.js App Router app styled with Tailwind and local components, and (b) why the session is an httpOnly cookie proxied server-side rather than a token in client storage.

- [ ] **Step 1: Write ADR 0015** — `docs/adr/0015-web-client-next-app-router.md`, Nygard format (Context / Decision / Consequences): the API is API-first, so the web UI is a separate Next.js app on the App Router; data is read in server components and mutations go through route handlers; styling is Tailwind CSS with a small set of local UI components rather than a component library, to keep the surface small and consistent. Consequence: front and back stay cleanly separated and independently deployable.

- [ ] **Step 2: Write ADR 0016** — `docs/adr/0016-session-httponly-cookie-bff.md`: the access token is stored in an httpOnly, `SameSite=Lax` cookie set by a login route handler; every API call is made from the Next server, which reads the cookie and attaches the `Bearer` header; the browser never sees the token and never calls the API directly. Consequences: no token is exposed to injected script; the API origin stays private so no CORS surface is opened; there is a single server-side place that talks to the API, which every screen reuses.

- [ ] **Step 3: Append the two rows to the ADR index** in `docs/adr/README.md` after `0014`:

```markdown
| 0015 | Web client: a separate Next.js App Router app | Accepted |
| 0016 | Session as an httpOnly cookie via a server-side BFF | Accepted |
```

- [ ] **Step 4: Verify formatting and commit**

```bash
cd /home/victor/Documents/coding/supportops
git branch --show-current   # expect feat/web-foundation-and-tickets (created with the plan-doc commit)
pnpm exec prettier --check "docs/**/*.md"   # or --write, then re-check
git add docs
git commit -m "docs(adr): record the web client and cookie-based session

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Scaffold `apps/web` (Next.js + Tailwind + Vitest) with a typed env module

**Files:**

- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/next-env.d.ts`, `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`, `apps/web/test/empty-module.ts`, `apps/web/.env.example`, `apps/web/eslint.config.js`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/app/page.tsx`, `apps/web/src/lib/env.ts`, `apps/web/src/lib/env.spec.ts`
- Modify: `apps/web/package.json` is picked up by the existing `apps/*` workspace glob — no root config change needed.

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces:
  - a runnable Next app (`dev` on port 3001, `build`, `start`, `lint`, `typecheck`, `test`)
  - `getApiUrl(): string` in `src/lib/env.ts` — returns `process.env.API_URL`, throwing a clear error if it is unset.

**Acceptance:** `pnpm --filter @supportops/web typecheck`, `lint`, and `test` all pass; the env module returns the configured URL and throws when it is missing; `next build` succeeds. The app renders a placeholder home page (replaced in Task 4 by a redirect).

- [ ] **Step 1: Write `apps/web/package.json`**

```json
{
  "name": "@supportops/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "15.1.6",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "server-only": "^0.0.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^19.0.7",
    "@types/react-dom": "^19.0.3",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint-plugin-react": "^7.37.4",
    "eslint-plugin-react-hooks": "^5.1.0",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write the config files.**

`apps/web/tsconfig.json` (Next needs `jsx: preserve`, the Next plugin, and `moduleResolution: bundler`; it does not extend the base because Next's compiler options differ):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "verbatimModuleSyntax": false,
    "allowJs": true,
    "skipLibCheck": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next.config.ts` (the `extensionAlias` lets the monorepo's `.js`-suffixed ESM imports resolve to their `.ts`/`.tsx` sources under Next's webpack, matching how the rest of the workspace imports; Vitest resolves the same via Vite):

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
```

`apps/web/postcss.config.mjs`:

```js
const config = {
  plugins: { '@tailwindcss/postcss': {} },
};

export default config;
```

`apps/web/next-env.d.ts` (committed so `tsc --noEmit` resolves Next's types in CI without a build; do **not** gitignore it):

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

`apps/web/vitest.config.ts` (the `server-only` alias is essential: the real `server-only` package throws when imported outside a React Server Component bundler, which would crash any suite that loads `http.ts`/`api.ts` — aliasing it to an empty module makes those server modules importable under Vitest):

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./test/empty-module.ts', import.meta.url)),
    },
  },
});
```

`apps/web/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

`apps/web/test/empty-module.ts` (the no-op `server-only` stands in for tests):

```ts
export {};
```

`apps/web/.env.example`:

```
# Base URL of the SupportOps API (server-side only; never exposed to the browser)
API_URL=http://localhost:3000
```

`apps/web/eslint.config.js` (reuses the repo's flat config and adds React rules for the app's JSX):

```js
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import root from '../../eslint.config.js';

export default [
  ...root,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
    },
  },
  { ignores: ['.next/**', 'next-env.d.ts'] },
];
```

- [ ] **Step 3: Write the app shell files.**

`apps/web/src/app/globals.css`:

```css
@import 'tailwindcss';

:root {
  color-scheme: light;
}

body {
  @apply bg-slate-50 text-slate-900 antialiased;
}
```

`apps/web/src/app/layout.tsx`:

```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'SupportOps',
  description: 'Support desk',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`apps/web/src/app/page.tsx` (temporary placeholder; Task 4 replaces the body with a redirect to `/tickets`):

```tsx
export default function HomePage() {
  return <main className="p-8">SupportOps</main>;
}
```

- [ ] **Step 4: Write the env module and its failing test.**

`apps/web/src/lib/env.spec.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { getApiUrl } from './env.js';

const original = process.env.API_URL;
afterEach(() => {
  process.env.API_URL = original;
});

describe('getApiUrl', () => {
  it('returns the configured API URL', () => {
    process.env.API_URL = 'http://api.test';
    expect(getApiUrl()).toBe('http://api.test');
  });

  it('throws a clear error when API_URL is unset', () => {
    delete process.env.API_URL;
    expect(() => getApiUrl()).toThrow(/API_URL/);
  });
});
```

- [ ] **Step 5: Install and verify the test fails**

```bash
cd /home/victor/Documents/coding/supportops
pnpm install
pnpm --filter @supportops/web test
```

Expected: FAIL — `./env.js` has no `getApiUrl` export yet.

- [ ] **Step 6: Implement `apps/web/src/lib/env.ts`**

```ts
export function getApiUrl(): string {
  const url = process.env.API_URL;
  if (!url) {
    throw new Error('API_URL is not set. Copy apps/web/.env.example to .env.local and set it.');
  }
  return url;
}
```

- [ ] **Step 7: Verify green and commit**

```bash
pnpm --filter @supportops/web test
pnpm --filter @supportops/web typecheck
pnpm --filter @supportops/web build     # generates .next; also proves the app compiles
pnpm --filter @supportops/web lint
pnpm exec prettier --check "apps/web/**/*.{ts,tsx,css,json}"
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold the next.js app with tailwind, vitest, and typed env

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: The server-side API client — types, low-level request, session, and typed calls (TDD)

**Files:**

- Create: `apps/web/src/lib/api-types.ts`, `apps/web/src/lib/http.ts`, `apps/web/src/lib/http.spec.ts`, `apps/web/src/lib/session.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/api.spec.ts`

**Interfaces:**

- Consumes: `getApiUrl` (Task 2).
- Produces:
  - `api-types.ts`: `Role`, `TicketStatus`, `TicketPriority`, `AuthorType` (string-literal unions matching the API enums); `Paginated<T> = { data: T[]; page: number; pageSize: number; total: number }`; `Me`, `Ticket`, `TicketComment`, `User`, `Customer` (timestamps typed as `string`).
  - `http.ts`: `class ApiError extends Error { status: number; body: unknown }`; `request<T>(path: string, opts?: RequestOptions): Promise<T>` where `RequestOptions = { method?: string; token?: string; body?: unknown; searchParams?: Record<string, string | undefined> }`.
  - `session.ts`: `SESSION_COOKIE = 'so_session'`; `getSessionToken(): Promise<string | undefined>`; `setSessionCookie(token: string): Promise<void>`; `clearSessionCookie(): Promise<void>`.
  - `api.ts`: `login(creds: { orgSlug: string; email: string; password: string }): Promise<string>` (returns the access token); and session-aware readers/mutators — `getMe`, `listTickets`, `getTicket`, `listComments`, `addComment`, `setStatus`, `assignTicket`, `listUsers`, `listCustomers` — with the signatures in Step 5.

**Acceptance:** `request` builds `${API_URL}${path}` with query string from `searchParams` (dropping `undefined`), sends JSON, attaches `Authorization: Bearer <token>` only when a token is given, returns parsed JSON on 2xx, and throws `ApiError` (carrying status + parsed body) on non-2xx. `api.ts` calls read the token from the session and forward it. No test touches the network.

- [ ] **Step 1: Write `api-types.ts`**

```ts
export type Role = 'OWNER' | 'ADMIN' | 'TEAM_LEAD' | 'AGENT';
export type TicketStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type AuthorType = 'AGENT' | 'CUSTOMER';

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgId: string;
  teamId: string | null;
}

export interface Ticket {
  id: string;
  customerId: string;
  assigneeId: string | null;
  teamId: string | null;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorType: AuthorType;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId: string | null;
}

export interface Customer {
  id: string;
  email: string;
  name: string;
}
```

- [ ] **Step 2: Write the failing `http.spec.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request, ApiError } from './http.js';

beforeEach(() => {
  process.env.API_URL = 'http://api.test';
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch(response: { status: number; body: unknown }) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('request', () => {
  it('GETs a JSON resource and returns the parsed body', async () => {
    const fetchMock = stubFetch({ status: 200, body: { id: 't1' } });
    const result = await request<{ id: string }>('/tickets/t1', { token: 'tok' });
    expect(result).toEqual({ id: 't1' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/tickets/t1');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok' });
  });

  it('appends defined search params and omits undefined ones', async () => {
    const fetchMock = stubFetch({ status: 200, body: { data: [] } });
    await request('/tickets', {
      token: 'tok',
      searchParams: { status: 'OPEN', teamId: undefined },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe('http://api.test/tickets?status=OPEN');
  });

  it('omits the Authorization header when no token is given', async () => {
    const fetchMock = stubFetch({ status: 200, body: {} });
    await request('/health');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('throws ApiError carrying status and body on a non-2xx response', async () => {
    stubFetch({ status: 400, body: { message: 'bad' } });
    await expect(
      request('/tickets', { token: 'tok', method: 'POST', body: {} }),
    ).rejects.toMatchObject({ name: 'ApiError', status: 400, body: { message: 'bad' } });
    expect(ApiError).toBeTypeOf('function');
  });
});
```

Run `pnpm --filter @supportops/web test src/lib/http.spec.ts` → FAIL (`./http.js` absent).

- [ ] **Step 3: Implement `http.ts`**

```ts
import 'server-only';
import { getApiUrl } from './env.js';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
  searchParams?: Record<string, string | undefined>;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(`${getApiUrl()}${path}`);
  for (const [key, value] of Object.entries(opts.searchParams ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: 'no-store',
  });

  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new ApiError(response.status, parsed);
  return parsed as T;
}
```

> Note: `new URL(url.toString())` renders the query without a trailing `?` when there are no params, which is why the second test expects `/tickets?status=OPEN` and the first expects no `?`.

- [ ] **Step 4: Implement `session.ts`** (thin wrapper over Next's cookie store; not unit-tested directly — exercised through route handlers in Task 4)

```ts
import 'server-only';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'so_session';

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
```

- [ ] **Step 5: Write the failing `api.spec.ts`** (mock `./http.js` and `./session.js` so no network or cookie store is touched)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./http.js', () => ({ request: vi.fn(), ApiError: class {} }));
vi.mock('./session.js', () => ({ getSessionToken: vi.fn() }));

import { request } from './http.js';
import { getSessionToken } from './session.js';
import { login, listTickets, addComment } from './api.js';

const requestMock = vi.mocked(request);
const tokenMock = vi.mocked(getSessionToken);

beforeEach(() => {
  vi.clearAllMocks();
  tokenMock.mockResolvedValue('sess-tok');
});

describe('api', () => {
  it('login posts credentials and returns the access token (no session token needed)', async () => {
    requestMock.mockResolvedValue({ accessToken: 'jwt-123' });
    const token = await login({ orgSlug: 'acme', email: 'a@acme.test', password: 'pw' });
    expect(token).toBe('jwt-123');
    expect(requestMock).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { orgSlug: 'acme', email: 'a@acme.test', password: 'pw' },
    });
  });

  it('listTickets forwards the session token and filters', async () => {
    requestMock.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });
    await listTickets({ status: 'OPEN', page: 2 });
    expect(requestMock).toHaveBeenCalledWith('/tickets', {
      token: 'sess-tok',
      searchParams: { status: 'OPEN', priority: undefined, assigneeId: undefined, page: '2' },
    });
  });

  it('addComment posts the body with the session token', async () => {
    requestMock.mockResolvedValue({ id: 'c1' });
    await addComment('t1', { body: 'hi', isInternal: true });
    expect(requestMock).toHaveBeenCalledWith('/tickets/t1/comments', {
      method: 'POST',
      token: 'sess-tok',
      body: { body: 'hi', isInternal: true },
    });
  });
});
```

Run → FAIL (`./api.js` absent).

- [ ] **Step 6: Implement `api.ts`**

```ts
import 'server-only';
import { request } from './http.js';
import { getSessionToken } from './session.js';
import type {
  Customer,
  Me,
  Paginated,
  Ticket,
  TicketComment,
  TicketPriority,
  TicketStatus,
  User,
} from './api-types.js';

async function token(): Promise<string | undefined> {
  return getSessionToken();
}

export async function login(creds: {
  orgSlug: string;
  email: string;
  password: string;
}): Promise<string> {
  const { accessToken } = await request<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: creds,
  });
  return accessToken;
}

export async function getMe(): Promise<Me> {
  return request<Me>('/auth/me', { token: await token() });
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  page?: number;
}

export async function listTickets(filters: TicketFilters = {}): Promise<Paginated<Ticket>> {
  return request<Paginated<Ticket>>('/tickets', {
    token: await token(),
    searchParams: {
      status: filters.status,
      priority: filters.priority,
      assigneeId: filters.assigneeId,
      page: filters.page ? String(filters.page) : undefined,
    },
  });
}

export async function getTicket(id: string): Promise<Ticket> {
  return request<Ticket>(`/tickets/${id}`, { token: await token() });
}

export async function listComments(ticketId: string): Promise<Paginated<TicketComment>> {
  return request<Paginated<TicketComment>>(`/tickets/${ticketId}/comments`, {
    token: await token(),
    searchParams: { pageSize: '100' },
  });
}

export async function addComment(
  ticketId: string,
  input: { body: string; isInternal?: boolean; authorType?: 'AGENT' | 'CUSTOMER' },
): Promise<TicketComment> {
  return request<TicketComment>(`/tickets/${ticketId}/comments`, {
    method: 'POST',
    token: await token(),
    body: input,
  });
}

export async function setStatus(ticketId: string, status: TicketStatus): Promise<Ticket> {
  return request<Ticket>(`/tickets/${ticketId}/status`, {
    method: 'PATCH',
    token: await token(),
    body: { status },
  });
}

export async function assignTicket(
  ticketId: string,
  patch: { assigneeId?: string | null; teamId?: string | null },
): Promise<Ticket> {
  return request<Ticket>(`/tickets/${ticketId}/assignment`, {
    method: 'PATCH',
    token: await token(),
    body: patch,
  });
}

export async function listUsers(): Promise<Paginated<User>> {
  return request<Paginated<User>>('/users', {
    token: await token(),
    searchParams: { pageSize: '100' },
  });
}

export async function listCustomers(): Promise<Paginated<Customer>> {
  return request<Paginated<Customer>>('/customers', {
    token: await token(),
    searchParams: { pageSize: '100' },
  });
}
```

- [ ] **Step 7: Run green and commit**

```bash
pnpm --filter @supportops/web test
pnpm --filter @supportops/web typecheck
pnpm --filter @supportops/web lint
git add apps/web
git commit -m "feat(web): server-side api client, session cookie, and typed calls

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Login, logout, and route protection (TDD)

**Files:**

- Create: `apps/web/src/components/ui/button.tsx`, `apps/web/src/components/ui/field.tsx`, `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/login/login-form.tsx`, `apps/web/src/app/(auth)/login/login-form.spec.tsx`, `apps/web/src/app/api/session/route.ts`, `apps/web/src/app/api/session/route.spec.ts`, `apps/web/src/middleware.ts`
- Modify: `apps/web/src/app/page.tsx` (redirect to `/tickets`)

**Interfaces:**

- Consumes: `login`, `ApiError`, `setSessionCookie`, `clearSessionCookie`, `SESSION_COOKIE`.
- Produces:
  - `POST /api/session` — body `{ orgSlug, email, password }`; on success sets the cookie and returns `{ ok: true }` (204-style JSON, 200); on bad credentials returns `{ error }` with status 401.
  - `DELETE /api/session` — clears the cookie, returns `{ ok: true }`.
  - `<Button>` and `<Field>` UI primitives.
  - `middleware` redirecting unauthenticated requests for app routes to `/login`.

**Acceptance:** posting valid credentials sets the session cookie and returns 200; invalid credentials return 401 and set no cookie; the login form calls `POST /api/session` and, on success, navigates to `/tickets`; middleware redirects a cookieless request for `/tickets` to `/login` and lets `/login` through.

- [ ] **Step 1: Write the UI primitives.**

`apps/web/src/components/ui/button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react';

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
```

`apps/web/src/components/ui/field.tsx`:

```tsx
import type { InputHTMLAttributes } from 'react';

export function Field({
  label,
  id,
  ...props
}: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        id={id}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        {...props}
      />
    </label>
  );
}
```

- [ ] **Step 2: Write the failing route-handler test** — `apps/web/src/app/api/session/route.spec.ts` (mock `@/lib/api.js` and `@/lib/session.js`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api.js', () => ({ login: vi.fn() }));
vi.mock('@/lib/session.js', () => ({
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
}));
vi.mock('@/lib/http.js', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super('api');
      this.status = status;
    }
  },
}));

import { login } from '@/lib/api.js';
import { setSessionCookie, clearSessionCookie } from '@/lib/session.js';
import { ApiError } from '@/lib/http.js';
import { POST, DELETE } from './route.js';

const loginMock = vi.mocked(login);

beforeEach(() => vi.clearAllMocks());

function post(body: unknown) {
  return new Request('http://localhost/api/session', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/session', () => {
  it('sets the session cookie and returns 200 on valid credentials', async () => {
    loginMock.mockResolvedValue('jwt-123');
    const res = await POST(post({ orgSlug: 'acme', email: 'a@acme.test', password: 'pw' }));
    expect(res.status).toBe(200);
    expect(setSessionCookie).toHaveBeenCalledWith('jwt-123');
  });

  it('returns 401 and sets no cookie when the API rejects the login', async () => {
    loginMock.mockRejectedValue(new ApiError(401));
    const res = await POST(post({ orgSlug: 'acme', email: 'a@acme.test', password: 'nope' }));
    expect(res.status).toBe(401);
    expect(setSessionCookie).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/session', () => {
  it('clears the cookie', async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(clearSessionCookie).toHaveBeenCalled();
  });
});
```

Run → FAIL (`./route.js` absent).

- [ ] **Step 3: Implement `apps/web/src/app/api/session/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { login } from '@/lib/api.js';
import { setSessionCookie, clearSessionCookie } from '@/lib/session.js';
import { ApiError } from '@/lib/http.js';

export async function POST(req: Request): Promise<NextResponse> {
  const { orgSlug, email, password } = (await req.json()) as {
    orgSlug?: string;
    email?: string;
    password?: string;
  };
  if (!orgSlug || !email || !password) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
  }
  try {
    const accessToken = await login({ orgSlug, email, password });
    await setSessionCookie(accessToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    throw err;
  }
}

export async function DELETE(): Promise<NextResponse> {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Write the failing login-form test** — `apps/web/src/app/(auth)/login/login-form.spec.tsx` (mock `next/navigation` and stub `fetch`):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { LoginForm } from './login-form.js';

beforeEach(() => {
  push.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LoginForm', () => {
  it('posts credentials and navigates to /tickets on success', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/organization/i), 'acme');
    await userEvent.type(screen.getByLabelText(/email/i), 'a@acme.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(push).toHaveBeenCalledWith('/tickets');
  });

  it('shows an error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"Invalid"}', { status: 401 })),
    );
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/organization/i), 'acme');
    await userEvent.type(screen.getByLabelText(/email/i), 'a@acme.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'bad');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
```

Run → FAIL (`./login-form.js` absent).

- [ ] **Step 5: Implement the login form and page.**

`apps/web/src/app/(auth)/login/login-form.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button.js';
import { Field } from '@/components/ui/field.js';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orgSlug: form.get('orgSlug'),
        email: form.get('email'),
        password: form.get('password'),
      }),
    });
    setPending(false);
    if (res.ok) {
      router.push('/tickets');
      router.refresh();
      return;
    }
    setError('Invalid credentials');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        id="orgSlug"
        name="orgSlug"
        label="Organization"
        autoComplete="organization"
        required
      />
      <Field id="email" name="email" type="email" label="Email" autoComplete="username" required />
      <Field
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
```

`apps/web/src/app/(auth)/login/page.tsx`:

```tsx
import { LoginForm } from './login-form.js';

export default function LoginPage() {
  return (
    <main className="mx-auto mt-24 w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="mb-6 text-xl font-semibold">Sign in to SupportOps</h1>
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 6: Implement middleware and the home redirect.**

`apps/web/src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'so_session';

export function middleware(req: NextRequest): NextResponse {
  const hasSession = req.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Guard everything except the login page, the session API, and static assets.
  matcher: ['/((?!login|api/session|_next/static|_next/image|favicon.ico).*)'],
};
```

`apps/web/src/app/page.tsx` (replace the placeholder):

```tsx
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/tickets');
}
```

- [ ] **Step 7: Run green and commit**

```bash
pnpm --filter @supportops/web test
pnpm --filter @supportops/web typecheck
pnpm --filter @supportops/web lint
git add apps/web
git commit -m "feat(web): login, logout, and route protection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: The authenticated app shell (TDD)

**Files:**

- Create: `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/components/app-header.tsx`, `apps/web/src/components/app-header.spec.tsx`, `apps/web/src/components/logout-button.tsx`

**Interfaces:**

- Consumes: `getMe` (Task 3); `Me` type.
- Produces: an app-route layout that loads the current user server-side and renders `<AppHeader user={me}>`; `<AppHeader>` shows the org-scoped user and a logout control; `<LogoutButton>` calls `DELETE /api/session` and navigates to `/login`.

**Acceptance:** the header renders the current user's name and a "Tickets" nav link; the logout button, when clicked, calls `DELETE /api/session` and pushes `/login`.

- [ ] **Step 1: Write the failing header test** — `apps/web/src/components/app-header.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { AppHeader } from './app-header.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  push.mockClear();
});

const me = {
  id: 'u1',
  email: 'a@acme.test',
  name: 'Ada Agent',
  role: 'AGENT' as const,
  orgId: 'o1',
  teamId: null,
};

describe('AppHeader', () => {
  it('shows the current user and a tickets link', () => {
    render(<AppHeader user={me} />);
    expect(screen.getByText('Ada Agent')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tickets/i })).toHaveAttribute('href', '/tickets');
  });

  it('logs out via DELETE /api/session and returns to /login', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AppHeader user={me} />);
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(push).toHaveBeenCalledWith('/login');
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement the header and logout button.**

`apps/web/src/components/logout-button.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/session', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  }
  return (
    <button onClick={logout} className="text-sm text-slate-600 hover:text-slate-900">
      Sign out
    </button>
  );
}
```

`apps/web/src/components/app-header.tsx`:

```tsx
import Link from 'next/link';
import type { Me } from '@/lib/api-types.js';
import { LogoutButton } from './logout-button.js';

export function AppHeader({ user }: { user: Me }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <nav className="flex items-center gap-6">
          <span className="font-semibold">SupportOps</span>
          <Link href="/tickets" className="text-sm text-slate-600 hover:text-slate-900">
            Tickets
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-700">{user.name}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Implement the app layout** — `apps/web/src/app/(app)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { getMe } from '@/lib/api.js';
import { AppHeader } from '@/components/app-header.js';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  return (
    <div>
      <AppHeader user={me} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Run green and commit**

```bash
pnpm --filter @supportops/web test
pnpm --filter @supportops/web typecheck
pnpm --filter @supportops/web lint
git add apps/web
git commit -m "feat(web): authenticated app shell with header and logout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: The ticket list with filters (TDD)

**Files:**

- Create: `apps/web/src/components/ui/badge.tsx`, `apps/web/src/lib/lookups.ts`, `apps/web/src/lib/lookups.spec.ts`, `apps/web/src/components/tickets/ticket-filters.tsx`, `apps/web/src/components/tickets/ticket-filters.spec.tsx`, `apps/web/src/app/(app)/tickets/page.tsx`

**Interfaces:**

- Consumes: `listTickets`, `listUsers`, `listCustomers`, the `Ticket`/`User`/`Customer` types.
- Produces:
  - `<Badge tone={'status' | 'priority'} value={string}>` — a small colored label.
  - `nameIndex(items: { id: string; name: string }[]): Map<string, string>` and `displayName(index: Map<string, string>, id: string | null): string` in `lookups.ts`.
  - `<TicketFilters current={{ status?, priority? }}>` — a client component that pushes `?status=&priority=` to the router.
  - the ticket-list server page reading `searchParams`, fetching tickets + users + customers, resolving names, and rendering a table with status/priority badges.

**Acceptance:** `displayName` returns the mapped name or a stable fallback (`'—'` for null, `'Unknown'` for a missing id); `<TicketFilters>` updates the query string on change; the page compiles and typechecks against the API contract.

- [ ] **Step 1: Write `badge.tsx`**

```tsx
const STATUS_TONES: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-amber-100 text-amber-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-slate-200 text-slate-700',
};

const PRIORITY_TONES: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-700',
  NORMAL: 'bg-slate-100 text-slate-700',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

export function Badge({ tone, value }: { tone: 'status' | 'priority'; value: string }) {
  const tones = tone === 'status' ? STATUS_TONES : PRIORITY_TONES;
  const className = tones[value] ?? 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${className}`}>
      {value.toLowerCase()}
    </span>
  );
}
```

- [ ] **Step 2: Write the failing `lookups.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { nameIndex, displayName } from './lookups.js';

describe('lookups', () => {
  it('indexes items by id and resolves display names', () => {
    const index = nameIndex([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bo' },
    ]);
    expect(displayName(index, 'a')).toBe('Ada');
    expect(displayName(index, null)).toBe('—');
    expect(displayName(index, 'missing')).toBe('Unknown');
  });
});
```

Run → FAIL.

- [ ] **Step 3: Implement `lookups.ts`**

```ts
export function nameIndex(items: { id: string; name: string }[]): Map<string, string> {
  return new Map(items.map((item) => [item.id, item.name]));
}

export function displayName(index: Map<string, string>, id: string | null): string {
  if (id === null) return '—';
  return index.get(id) ?? 'Unknown';
}
```

- [ ] **Step 4: Write the failing `ticket-filters.spec.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { TicketFilters } from './ticket-filters.js';

beforeEach(() => push.mockClear());

describe('TicketFilters', () => {
  it('pushes the selected status to the query string', async () => {
    render(<TicketFilters current={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'OPEN');
    expect(push).toHaveBeenCalledWith('/tickets?status=OPEN');
  });

  it('clears a filter when "All" is chosen', async () => {
    render(<TicketFilters current={{ status: 'OPEN' }} />);
    await userEvent.selectOptions(screen.getByLabelText(/status/i), '');
    expect(push).toHaveBeenCalledWith('/tickets');
  });
});
```

Run → FAIL.

- [ ] **Step 5: Implement `ticket-filters.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import type { TicketPriority, TicketStatus } from '@/lib/api-types.js';

const STATUSES: TicketStatus[] = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITIES: TicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

export function TicketFilters({
  current,
}: {
  current: { status?: TicketStatus; priority?: TicketPriority };
}) {
  const router = useRouter();

  function apply(next: { status?: string; priority?: string }) {
    const params = new URLSearchParams();
    const status = next.status ?? current.status;
    const priority = next.priority ?? current.priority;
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    const qs = params.toString();
    router.push(qs ? `/tickets?${qs}` : '/tickets');
  }

  return (
    <div className="mb-4 flex gap-4">
      <label className="text-sm">
        <span className="mr-2 text-slate-600">Status</span>
        <select
          className="rounded border border-slate-300 px-2 py-1"
          defaultValue={current.status ?? ''}
          onChange={(e) => apply({ status: e.target.value })}
        >
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mr-2 text-slate-600">Priority</span>
        <select
          className="rounded border border-slate-300 px-2 py-1"
          defaultValue={current.priority ?? ''}
          onChange={(e) => apply({ priority: e.target.value })}
        >
          <option value="">All</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p.toLowerCase()}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
```

> The `apply` helper reads the _other_ select's current value from `current`, so changing one filter preserves the other. When "All" (`''`) is chosen the param is dropped.

- [ ] **Step 6: Implement the ticket-list page** — `apps/web/src/app/(app)/tickets/page.tsx`:

```tsx
import Link from 'next/link';
import { listCustomers, listTickets, listUsers } from '@/lib/api.js';
import type { TicketPriority, TicketStatus } from '@/lib/api-types.js';
import { Badge } from '@/components/ui/badge.js';
import { TicketFilters } from '@/components/tickets/ticket-filters.js';
import { displayName, nameIndex } from '@/lib/lookups.js';

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const params = await searchParams;
  const status = params.status as TicketStatus | undefined;
  const priority = params.priority as TicketPriority | undefined;

  const [tickets, users, customers] = await Promise.all([
    listTickets({ status, priority }),
    listUsers(),
    listCustomers(),
  ]);
  const agents = nameIndex(users.data);
  const people = nameIndex(customers.data);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Tickets</h1>
      <TicketFilters current={{ status, priority }} />
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2">Subject</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Customer</th>
            <th>Assignee</th>
          </tr>
        </thead>
        <tbody>
          {tickets.data.map((ticket) => (
            <tr key={ticket.id} className="border-b border-slate-100 hover:bg-white">
              <td className="py-2">
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {ticket.subject}
                </Link>
              </td>
              <td>
                <Badge tone="status" value={ticket.status} />
              </td>
              <td>
                <Badge tone="priority" value={ticket.priority} />
              </td>
              <td>{displayName(people, ticket.customerId)}</td>
              <td>{displayName(agents, ticket.assigneeId)}</td>
            </tr>
          ))}
          {tickets.data.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-slate-500">
                No tickets match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 7: Run green and commit**

```bash
pnpm --filter @supportops/web test
pnpm --filter @supportops/web typecheck
pnpm --filter @supportops/web lint
git add apps/web
git commit -m "feat(web): ticket list with status and priority filters

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: The ticket detail — read view (TDD)

**Files:**

- Create: `apps/web/src/lib/format.ts`, `apps/web/src/lib/format.spec.ts`, `apps/web/src/components/tickets/comment-thread.tsx`, `apps/web/src/components/tickets/comment-thread.spec.tsx`, `apps/web/src/app/(app)/tickets/[id]/page.tsx`

**Interfaces:**

- Consumes: `getTicket`, `listComments`, `listUsers`, `listCustomers`; `TicketComment`, `Ticket` types; `Badge`, `displayName`/`nameIndex`.
- Produces:
  - `formatDateTime(iso: string): string` in `format.ts`.
  - `<CommentThread comments={TicketComment[]} authorNames={Map<string,string>}>` — renders each comment's author, timestamp, body, and an "internal" marker.
  - the ticket-detail server page rendering the ticket fields, badges, resolved customer/assignee, and the thread. (Action controls are added in Task 8.)

**Acceptance:** `formatDateTime` renders a stable, locale-independent string for a known ISO input; `<CommentThread>` shows the author name, the body, and an "Internal note" marker only on internal comments, and an empty-state line when there are none.

- [ ] **Step 1: Write the failing `format.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { formatDateTime } from './format.js';

describe('formatDateTime', () => {
  it('formats an ISO timestamp as YYYY-MM-DD HH:mm in UTC', () => {
    expect(formatDateTime('2026-08-29T14:05:00.000Z')).toBe('2026-08-29 14:05');
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `format.ts`** (UTC, fixed format — no locale/timezone drift in tests)

```ts
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}
```

- [ ] **Step 3: Write the failing `comment-thread.spec.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommentThread } from './comment-thread.js';

const authorNames = new Map([['u1', 'Ada Agent']]);

describe('CommentThread', () => {
  it('renders comments with author, body, and an internal marker', () => {
    render(
      <CommentThread
        authorNames={authorNames}
        comments={[
          {
            id: 'c1',
            ticketId: 't1',
            authorType: 'AGENT',
            authorId: 'u1',
            body: 'Looking into it',
            isInternal: true,
            createdAt: '2026-08-29T14:05:00.000Z',
          },
        ]}
      />,
    );
    expect(screen.getByText('Ada Agent')).toBeInTheDocument();
    expect(screen.getByText('Looking into it')).toBeInTheDocument();
    expect(screen.getByText(/internal note/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no comments', () => {
    render(<CommentThread authorNames={authorNames} comments={[]} />);
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
  });
});
```

Run → FAIL.

- [ ] **Step 4: Implement `comment-thread.tsx`**

```tsx
import type { TicketComment } from '@/lib/api-types.js';
import { formatDateTime } from '@/lib/format.js';
import { displayName } from '@/lib/lookups.js';

export function CommentThread({
  comments,
  authorNames,
}: {
  comments: TicketComment[];
  authorNames: Map<string, string>;
}) {
  if (comments.length === 0) {
    return <p className="text-sm text-slate-500">No comments yet.</p>;
  }
  return (
    <ul className="space-y-4">
      {comments.map((comment) => (
        <li
          key={comment.id}
          className={`rounded-md border p-3 ${
            comment.isInternal ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">
              {comment.authorType === 'CUSTOMER'
                ? 'Customer'
                : displayName(authorNames, comment.authorId)}
            </span>
            <span>{formatDateTime(comment.createdAt)}</span>
            {comment.isInternal && (
              <span className="rounded bg-amber-200 px-1.5 py-0.5 font-medium text-amber-900">
                Internal note
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm text-slate-800">{comment.body}</p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Implement the detail page (read view)** — `apps/web/src/app/(app)/tickets/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getTicket, listComments, listCustomers, listUsers } from '@/lib/api.js';
import { ApiError } from '@/lib/http.js';
import { Badge } from '@/components/ui/badge.js';
import { CommentThread } from '@/components/tickets/comment-thread.js';
import { displayName, nameIndex } from '@/lib/lookups.js';

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let ticket;
  try {
    ticket = await getTicket(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const [comments, users, customers] = await Promise.all([
    listComments(id),
    listUsers(),
    listCustomers(),
  ]);
  const agents = nameIndex(users.data);
  const people = nameIndex(customers.data);

  return (
    <article className="space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2">
          <Badge tone="status" value={ticket.status} />
          <Badge tone="priority" value={ticket.priority} />
        </div>
        <h1 className="text-xl font-semibold">{ticket.subject}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Customer: {displayName(people, ticket.customerId)} · Assignee:{' '}
          {displayName(agents, ticket.assigneeId)}
        </p>
      </header>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <p className="whitespace-pre-wrap text-sm text-slate-800">{ticket.description}</p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Comments</h2>
        <CommentThread comments={comments.data} authorNames={agents} />
      </section>
    </article>
  );
}
```

- [ ] **Step 6: Run green and commit**

```bash
pnpm --filter @supportops/web test
pnpm --filter @supportops/web typecheck
pnpm --filter @supportops/web lint
git add apps/web
git commit -m "feat(web): ticket detail read view with comment thread

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Ticket actions — status, assignment, and commenting (TDD)

**Files:**

- Create: `apps/web/src/app/api/tickets/[id]/status/route.ts`, `apps/web/src/app/api/tickets/[id]/assignment/route.ts`, `apps/web/src/app/api/tickets/[id]/comments/route.ts`, `apps/web/src/app/api/tickets/[id]/status/route.spec.ts`, `apps/web/src/components/tickets/status-control.tsx`, `apps/web/src/components/tickets/assign-control.tsx`, `apps/web/src/components/tickets/comment-form.tsx`, `apps/web/src/components/tickets/comment-form.spec.tsx`, `apps/web/src/components/tickets/status-control.spec.tsx`
- Modify: `apps/web/src/app/(app)/tickets/[id]/page.tsx` (mount the controls and pass the agent list)

**Interfaces:**

- Consumes: `setStatus`, `assignTicket`, `addComment` (Task 3); `User` type.
- Produces:
  - `PATCH /api/tickets/:id/status` — body `{ status }` → calls `setStatus`, returns the updated ticket.
  - `PATCH /api/tickets/:id/assignment` — body `{ assigneeId?, teamId? }` → calls `assignTicket`.
  - `POST /api/tickets/:id/comments` — body `{ body, isInternal?, authorType? }` → calls `addComment`.
  - `<StatusControl ticketId status>`, `<AssignControl ticketId assigneeId agents>`, `<CommentForm ticketId>` — client components that call the route handlers and `router.refresh()` on success.

**Acceptance:** the status route calls `setStatus(id, body.status)` and returns 200; `<StatusControl>` posts the chosen status and refreshes; `<CommentForm>` posts the body + `isInternal` flag, clears the field, and refreshes. Existing tests stay green.

- [ ] **Step 1: Write the failing status-route test** — `apps/web/src/app/api/tickets/[id]/status/route.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api.js', () => ({ setStatus: vi.fn() }));
import { setStatus } from '@/lib/api.js';
import { PATCH } from './route.js';

const setStatusMock = vi.mocked(setStatus);
beforeEach(() => vi.clearAllMocks());

describe('PATCH /api/tickets/:id/status', () => {
  it('sets the status and returns the updated ticket', async () => {
    setStatusMock.mockResolvedValue({ id: 't1', status: 'RESOLVED' } as never);
    const req = new Request('http://localhost/api/tickets/t1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'RESOLVED' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 't1' }) });
    expect(res.status).toBe(200);
    expect(setStatusMock).toHaveBeenCalledWith('t1', 'RESOLVED');
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement the three route handlers.**

`apps/web/src/app/api/tickets/[id]/status/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { setStatus } from '@/lib/api.js';
import type { TicketStatus } from '@/lib/api-types.js';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { status } = (await req.json()) as { status: TicketStatus };
  const ticket = await setStatus(id, status);
  return NextResponse.json(ticket);
}
```

`apps/web/src/app/api/tickets/[id]/assignment/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { assignTicket } from '@/lib/api.js';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const patch = (await req.json()) as { assigneeId?: string | null; teamId?: string | null };
  const ticket = await assignTicket(id, patch);
  return NextResponse.json(ticket);
}
```

`apps/web/src/app/api/tickets/[id]/comments/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { addComment } from '@/lib/api.js';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const input = (await req.json()) as { body: string; isInternal?: boolean };
  const comment = await addComment(id, input);
  return NextResponse.json(comment, { status: 201 });
}
```

- [ ] **Step 3: Write the failing control tests** — `status-control.spec.tsx` and `comment-form.spec.tsx`:

```tsx
// status-control.spec.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { StatusControl } from './status-control.js';

beforeEach(() => refresh.mockClear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('StatusControl', () => {
  it('patches the chosen status and refreshes', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<StatusControl ticketId="t1" status="OPEN" />);
    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'RESOLVED');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tickets/t1/status',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(refresh).toHaveBeenCalled();
  });
});
```

```tsx
// comment-form.spec.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { CommentForm } from './comment-form.js';

beforeEach(() => refresh.mockClear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CommentForm', () => {
  it('posts the comment body and internal flag, then refreshes', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CommentForm ticketId="t1" />);
    await userEvent.type(screen.getByLabelText(/add a comment/i), 'On it');
    await userEvent.click(screen.getByLabelText(/internal note/i));
    await userEvent.click(screen.getByRole('button', { name: /post comment/i }));

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      body: 'On it',
      isInternal: true,
    });
    expect(refresh).toHaveBeenCalled();
  });
});
```

Run → FAIL.

- [ ] **Step 4: Implement the three control components.**

`apps/web/src/components/tickets/status-control.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import type { TicketStatus } from '@/lib/api-types.js';

const STATUSES: TicketStatus[] = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];

export function StatusControl({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const router = useRouter();
  async function change(next: string) {
    await fetch(`/api/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    router.refresh();
  }
  return (
    <label className="text-sm">
      <span className="mr-2 text-slate-600">Status</span>
      <select
        className="rounded border border-slate-300 px-2 py-1"
        defaultValue={status}
        onChange={(e) => change(e.target.value)}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.toLowerCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
```

`apps/web/src/components/tickets/assign-control.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import type { User } from '@/lib/api-types.js';

export function AssignControl({
  ticketId,
  assigneeId,
  agents,
}: {
  ticketId: string;
  assigneeId: string | null;
  agents: User[];
}) {
  const router = useRouter();
  async function change(value: string) {
    await fetch(`/api/tickets/${ticketId}/assignment`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assigneeId: value === '' ? null : value }),
    });
    router.refresh();
  }
  return (
    <label className="text-sm">
      <span className="mr-2 text-slate-600">Assignee</span>
      <select
        className="rounded border border-slate-300 px-2 py-1"
        defaultValue={assigneeId ?? ''}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">Unassigned</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
    </label>
  );
}
```

`apps/web/src/components/tickets/comment-form.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button.js';

export function CommentForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    await fetch(`/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body, isInternal }),
    });
    setPending(false);
    setBody('');
    setIsInternal(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-2">
      <label htmlFor="comment-body" className="block text-sm font-medium text-slate-700">
        Add a comment
      </label>
      <textarea
        id="comment-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
          />
          Internal note
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? 'Posting…' : 'Post comment'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Mount the controls in the detail page** — in `apps/web/src/app/(app)/tickets/[id]/page.tsx`, import the three controls, and replace the header's static assignee/status line region by adding a controls row and the comment form. Add these imports:

```tsx
import { StatusControl } from '@/components/tickets/status-control.js';
import { AssignControl } from '@/components/tickets/assign-control.js';
import { CommentForm } from '@/components/tickets/comment-form.js';
```

Insert a controls section after the `<header>` block:

```tsx
<section className="flex flex-wrap gap-6 rounded-md border border-slate-200 bg-white p-4">
  <StatusControl ticketId={ticket.id} status={ticket.status} />
  <AssignControl ticketId={ticket.id} assigneeId={ticket.assigneeId} agents={users.data} />
</section>
```

and add the comment form at the end of the Comments section, after `<CommentThread ... />`:

```tsx
<CommentForm ticketId={ticket.id} />
```

- [ ] **Step 6: Run green and commit**

```bash
pnpm --filter @supportops/web test
pnpm --filter @supportops/web typecheck
pnpm --filter @supportops/web lint
git add apps/web
git commit -m "feat(web): ticket status, assignment, and comment actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Document the frontend and open the PR

**Files:**

- Modify: `docs/architecture.md`, `CLAUDE.md`, `README.md`

**Acceptance:** `docs/architecture.md` describes `apps/web`, the App Router + server-side BFF, and the single server-side API path; `CLAUDE.md` gains a short "Web" invariant (the browser never holds the token; all API access goes through the server); `README.md` documents running the web app (`API_URL`, port 3001). The whole workspace is green and the PR targets `develop`.

- [ ] **Step 1: Update `docs/architecture.md`** — add `apps/web` to the layout list; add a "Web client" subsection describing: a Next.js App Router app; data read in server components through a single server-side client (`src/lib/http.ts` + `src/lib/api.ts`); mutations via route handlers; the session held in an httpOnly cookie so the browser never sees the JWT and never calls the API directly; link ADRs 0015/0016. Match the surrounding prose.

- [ ] **Step 2: Update `CLAUDE.md`** — add a new "Web" heading: the web app talks to the API only from the server; the JWT lives in an httpOnly cookie and is never exposed to client code or `localStorage`; all API calls go through `apps/web/src/lib` — no second client and no direct browser→API request.

- [ ] **Step 3: Update `README.md`** — under running the stack, note that `apps/web` runs on port 3001 with `pnpm --filter @supportops/web dev`, requires `API_URL` (see `apps/web/.env.example`), and that the API stays on port 3000.

- [ ] **Step 4: Full green + format**

```bash
cd /home/victor/Documents/coding/supportops
docker compose up -d postgres            # for the API test suite in the workspace run
pnpm build && pnpm typecheck && pnpm lint && pnpm test
pnpm exec prettier --check .
```

Expected: every package builds, typechecks, lints, and tests green; format clean.

- [ ] **Step 5: Commit, push, open the PR**

```bash
git add docs CLAUDE.md README.md
git commit -m "docs: document the web client and its cookie-based session

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push -u origin HEAD
gh pr create --base develop \
  --title "feat: web foundation and the agent ticket workflow" \
  --body "Adds apps/web, a Next.js (App Router) client for agents. Login stores the JWT in an httpOnly cookie; every API call is made from the Next server (server components + route handlers), so the browser never holds the token and the API needs no CORS change. Screens: login, ticket list with status/priority filters, and ticket detail with the comment thread plus status, assignment, and commenting. Styled with Tailwind and a small set of local components. Decisions in ADRs 0015 and 0016. The API is unchanged. Components and the server client are unit-tested (Testing Library + a stubbed fetch); no test needs a browser or a live API."
```

Expected: CI (typecheck, lint, test) goes green on the PR.

---

## Notes for the executor

- **Run the web tasks with `pnpm --filter @supportops/web <task>`.** The web suite needs no Postgres and no Redis; only the workspace-wide `pnpm test` in Task 9 needs Postgres (for the existing API suite).
- **`next-env.d.ts` is committed on purpose** so `tsc --noEmit` resolves Next's types in CI without a build. Do not add it to `.gitignore`.
- **Next 15 dynamic APIs are async:** `cookies()`, `params`, and `searchParams` are awaited. Keep the `await` in server components and route handlers.
- **Server-only modules** (`http.ts`, `session.ts`, `api.ts`) import `server-only`; never import them from a `'use client'` component. Client components reach the server only through `fetch('/api/...')`.
- Keep every commit green (`pnpm --filter @supportops/web test` + `typecheck` + `lint`, and `pnpm exec prettier --check .`).
- Feature branch off `develop` (`feat/web-foundation-and-tickets`); never commit to `develop` directly.
