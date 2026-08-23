# Phase 6 — Notifications & queue

> Executed task by task. Each task is a small, independently testable slice that ends green — tests, lint, and typecheck all passing — before the next begins. Steps use checkboxes (`- [ ]`) for tracking.

**Goal:** Deliver ticket notifications asynchronously. A ticket action records a `Notification` and enqueues a delivery job; a background worker consumes the job and "sends" it through a pluggable transport. `TICKET_ASSIGNED` fires when a ticket gains an agent assignee and `TICKET_COMMENTED` when a comment is added.

**Architecture:** Two new packages and one worker. `packages/queue` is BullMQ-over-Redis plumbing (connection, producer, worker factories, a typed job) with no knowledge of the database or transports. `packages/notifications` is the domain: a `Transport` interface + `ConsoleTransport`, a pure message renderer, a `NotificationService` that persists a `Notification` (status `PENDING`) then enqueues, and a `deliverNotification` consumer that sends and records `SENT`/`FAILED`. `workers/notification-worker` wires the queue consumer to `deliverNotification`. The API's ticket flows call `NotificationService`; the enqueue is best-effort so a Redis outage never fails a ticket action.

**Tech Stack:** BullMQ 5 + ioredis 5, Prisma 5 / PostgreSQL 16, NestJS 10 (an API module wrapper only), Vitest 2, TypeScript 5.5 (ESM / NodeNext), pnpm + Turborepo.

**Spec:** none in this repository — the requirements are captured in the ADRs written in Task 1 (`docs/adr/0013`, `docs/adr/0014`) and in `docs/architecture.md`.

## Global Constraints

- **No schema migration.** The `Notification` model and the `NotificationType` / `NotificationChannel` / `NotificationStatus` enums already exist from an earlier phase; this phase is application code only.
- **Scope: immediate, single-recipient delivery.** A notification is a one-shot message to a single user, sent as soon as the triggering action happens. Digests, delayed sends, retry policies, and per-user preferences are out of scope for this iteration.
- **Product actions never fail on the notification backend.** Persisting the `Notification` row is awaited; the enqueue is fire-and-forget with the error caught and logged. The producer's Redis connection is configured to fail fast (`enableOfflineQueue: false`, bounded retry), never buffer or reconnect forever; the worker's connection is resilient.
- **One recipient, always a real user.** `Notification.userId` is required. Team-only assignment and unassignment emit nothing. A comment notifies the ticket's current assignee unless that assignee performed the action.
- **Prisma stays in services / domain functions.** Only `@supportops/notifications` code and existing `*.service.ts` touch the client.
- **Time is UTC.** `sentAt` is a server `Date`; timestamps remain `timestamptz`.
- **Tests are non-optional and Redis-free.** No test connects to Redis. DB-backed domain tests use a per-package migrated test database (the `packages/db` harness pattern); the API suite injects a null producer.
- **ESM everywhere.** Relative imports carry `.js` extensions; packages are `"type": "module"`; `tsconfig` extends `tsconfig.base.json`.
- Node `>=20` (local and CI run Node 24); pnpm only (9.7.0); commits carry `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; work lands on `develop` via a feature branch (`feat/notifications-and-queue`) and PR.

---

### Task 1: Record the notification-delivery decisions (ADRs 0013, 0014)

**Files:**

- Create: `docs/adr/0013-asynchronous-notifications.md`, `docs/adr/0014-notification-triggers-and-recipients.md`
- Modify: `docs/adr/README.md` (append two rows)

**Interfaces:**

- Consumes: nothing (documentation).
- Produces: the accepted decisions the rest of the phase implements — the persist-then-enqueue delivery model with a pluggable transport and best-effort enqueue (0013); the trigger and recipient rules (0014).

**Acceptance:** two new ADRs in `Accepted` status, indexed in the README, describing (a) asynchronous delivery via queue + worker + transport and the best-effort-enqueue posture, and (b) `TICKET_ASSIGNED` → new assignee, `TICKET_COMMENTED` → current assignee minus author, team-only/unassignment emit nothing.

- [ ] **Step 1: Write ADR 0013** — `docs/adr/0013-asynchronous-notifications.md`, Nygard format (Context / Decision / Consequences): persist a `Notification` (`PENDING`) then enqueue a job carrying only `notificationId`; a worker delivers via a `Transport` (console today) and records `SENT`/`FAILED`; enqueue is best-effort so a queue outage never fails the request.

- [ ] **Step 2: Write ADR 0014** — `docs/adr/0014-notification-triggers-and-recipients.md`: `TICKET_ASSIGNED` on gaining/changing an agent assignee (recipient = new assignee); `TICKET_COMMENTED` on a comment (recipient = current assignee, skipped if they performed the action or the ticket is unassigned; fires for internal and on-behalf comments); team-only assignment and unassignment emit nothing.

- [ ] **Step 3: Append the two rows to the ADR index** in `docs/adr/README.md` after `0012`:

```markdown
| 0013 | Asynchronous notifications via queue and worker | Accepted |
| 0014 | Notification triggers and recipients | Accepted |
```

- [ ] **Step 4: Verify formatting and commit**

```bash
cd /home/victor/Documents/coding/supportops
pnpm exec prettier --check "docs/**/*.md"   # or --write, then re-check
git add docs
git commit -m "docs(adr): record asynchronous notification delivery and triggers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `packages/queue` — BullMQ plumbing (TDD)

**Files:**

- Create: `packages/queue/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,src/index.spec.ts}`

**Interfaces:**

- Consumes: `bullmq` (`Queue`, `Worker`, `Processor`), `ioredis` (`Redis`).
- Produces:
  - `const NOTIFICATION_QUEUE_NAME = 'notifications'`
  - `interface NotificationJobData { notificationId: string }`
  - `interface NotificationProducer { add(data: NotificationJobData): Promise<void>; close(): Promise<void> }`
  - `createRedisConnection(redisUrl: string, options?: { failFast?: boolean }): Redis`
  - `createNotificationQueue(connection: Redis): NotificationProducer`
  - `createNotificationWorker(connection: Redis, processor: Processor<NotificationJobData, void>): Worker<NotificationJobData, void>`

**Acceptance:** the package builds and typechecks; a producer can be constructed without a live Redis; `createRedisConnection(url, { failFast: true })` yields `{ enableOfflineQueue: false, maxRetriesPerRequest: null, lazyConnect: true }` and the default yields a resilient connection (`enableOfflineQueue: true`, `maxRetriesPerRequest: null`). No test connects to Redis.

- [ ] **Step 1: Scaffold the package** — `package.json` (`@supportops/queue`, `"type": "module"`, scripts `build`/`test`/`lint`/`typecheck` mirroring `packages/config`; deps `bullmq@^5.34.0`, `ioredis@^5.4.1`; devDeps `typescript`, `vitest`), `tsconfig.json` (extends base, `outDir dist`, `rootDir src`, exclude `src/**/*.spec.ts`), and `vitest.config.ts` (`test: { globals: true }`).

- [ ] **Step 2: Write the failing test** — `packages/queue/src/index.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NOTIFICATION_QUEUE_NAME, createRedisConnection } from './index.js';

describe('notification queue', () => {
  it('names the queue "notifications"', () => {
    expect(NOTIFICATION_QUEUE_NAME).toBe('notifications');
  });

  it('creates a fail-fast, lazy connection for the producer', () => {
    const connection = createRedisConnection('redis://localhost:6379', { failFast: true });
    expect(connection.options.enableOfflineQueue).toBe(false);
    expect(connection.options.maxRetriesPerRequest).toBeNull();
    expect(connection.options.lazyConnect).toBe(true);
    connection.disconnect();
  });

  it('creates a resilient connection by default for the worker', () => {
    const connection = createRedisConnection('redis://localhost:6379');
    expect(connection.options.enableOfflineQueue).toBe(true);
    expect(connection.options.maxRetriesPerRequest).toBeNull();
    connection.disconnect();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
pnpm install
pnpm --filter @supportops/queue test
```

Expected: FAIL — `./index.js` does not export these yet.

- [ ] **Step 4: Implement** — `packages/queue/src/index.ts`. Use ioredis's **named** `Redis` export (its default export is not constructable under NodeNext):

```ts
import { Queue, Worker, type Processor } from 'bullmq';
import { Redis } from 'ioredis';

export const NOTIFICATION_QUEUE_NAME = 'notifications';

export interface NotificationJobData {
  notificationId: string;
}

export interface NotificationProducer {
  add(data: NotificationJobData): Promise<void>;
  close(): Promise<void>;
}

export function createRedisConnection(
  redisUrl: string,
  options: { failFast?: boolean } = {},
): Redis {
  if (options.failFast) {
    return new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: (attempt: number) => (attempt > 3 ? null : Math.min(attempt * 200, 1000)),
    });
  }
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}

export function createNotificationQueue(connection: Redis): NotificationProducer {
  const queue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, { connection });
  return {
    async add(data) {
      await queue.add('notify', data, { removeOnComplete: true, removeOnFail: 100 });
    },
    async close() {
      await queue.close();
    },
  };
}

export function createNotificationWorker(
  connection: Redis,
  processor: Processor<NotificationJobData, void>,
): Worker<NotificationJobData, void> {
  return new Worker<NotificationJobData, void>(NOTIFICATION_QUEUE_NAME, processor, { connection });
}
```

- [ ] **Step 5: Run to verify green**

```bash
pnpm --filter @supportops/queue test
pnpm --filter @supportops/queue build && pnpm --filter @supportops/queue typecheck
```

Expected: 3 tests PASS; build + typecheck exit 0. Root `pnpm exec eslint .` and `pnpm exec prettier --check .` clean.

- [ ] **Step 6: Commit**

```bash
git add packages/queue pnpm-lock.yaml
git commit -m "feat(queue): bullmq notification queue plumbing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `packages/notifications` — transport, console transport, and renderer (TDD, pure)

**Files:**

- Create: `packages/notifications/{package.json,tsconfig.json,vitest.config.ts}` and `src/{transport.ts,console-transport.ts,console-transport.spec.ts,render.ts,render.spec.ts,index.ts}`

**Interfaces:**

- Consumes: `NotificationType` from `@supportops/db`.
- Produces:
  - `interface NotificationMessage { to: string; subject: string; body: string }`
  - `interface Transport { send(message: NotificationMessage): Promise<void> }`
  - `class ConsoleTransport implements Transport`
  - `interface NotificationPayload { ticketId: string; ticketSubject: string }`
  - `renderMessage(input: { type: NotificationType; recipientEmail: string; payload: NotificationPayload }): NotificationMessage`

**Acceptance:** `renderMessage` produces a distinct, recipient-addressed subject/body per `NotificationType` (pure, no I/O); `ConsoleTransport.send` logs the recipient and subject and never throws. No DB, no Redis.

- [ ] **Step 1: Scaffold the package** — `package.json` (`@supportops/notifications`, `"type": "module"`; deps `@supportops/db` + `@supportops/queue` as `workspace:*`; devDeps `pg`, `prisma`, `typescript`, `vitest`), `tsconfig.json` (extends base, exclude specs), `vitest.config.ts` (added in Task 4 for the DB harness — for now `test: { globals: true }` is enough; Task 4 replaces it).

- [ ] **Step 2: Write `transport.ts`** — the `NotificationMessage` and `Transport` interfaces (see Interfaces above).

- [ ] **Step 3: Write the failing renderer + transport tests** — `src/render.spec.ts` and `src/console-transport.spec.ts`:

```ts
// render.spec.ts
import { describe, it, expect } from 'vitest';
import { renderMessage } from './render.js';

const payload = { ticketId: 't1', ticketSubject: 'Cannot log in' };

describe('renderMessage', () => {
  it('renders an assignment message addressed to the recipient', () => {
    const msg = renderMessage({ type: 'TICKET_ASSIGNED', recipientEmail: 'a@acme.test', payload });
    expect(msg.to).toBe('a@acme.test');
    expect(msg.subject).toContain('assigned');
    expect(msg.subject).toContain('Cannot log in');
    expect(msg.body).toContain('Cannot log in');
  });

  it('renders a comment message', () => {
    const msg = renderMessage({ type: 'TICKET_COMMENTED', recipientEmail: 'a@acme.test', payload });
    expect(msg.subject).toContain('comment');
    expect(msg.body).toContain('Cannot log in');
  });
});
```

```ts
// console-transport.spec.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConsoleTransport } from './console-transport.js';

afterEach(() => vi.restoreAllMocks());

describe('ConsoleTransport', () => {
  it('logs the recipient and subject', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await new ConsoleTransport().send({
      to: 'agent@acme.test',
      subject: 'Ticket assigned to you: Cannot log in',
      body: 'Ticket "Cannot log in" has been assigned to you.',
    });
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain('agent@acme.test');
    expect(log.mock.calls[0]?.[0]).toContain('Cannot log in');
  });
});
```

Run `pnpm --filter @supportops/notifications test` → FAIL (`render.js` / `console-transport.js` absent).

- [ ] **Step 4: Implement `render.ts` and `console-transport.ts`**

```ts
// render.ts
import type { NotificationType } from '@supportops/db';
import type { NotificationMessage } from './transport.js';

export interface NotificationPayload {
  ticketId: string;
  ticketSubject: string;
}

export function renderMessage(input: {
  type: NotificationType;
  recipientEmail: string;
  payload: NotificationPayload;
}): NotificationMessage {
  const { type, recipientEmail, payload } = input;
  switch (type) {
    case 'TICKET_ASSIGNED':
      return {
        to: recipientEmail,
        subject: `Ticket assigned to you: ${payload.ticketSubject}`,
        body: `Ticket "${payload.ticketSubject}" has been assigned to you.`,
      };
    case 'TICKET_COMMENTED':
      return {
        to: recipientEmail,
        subject: `New comment on: ${payload.ticketSubject}`,
        body: `A new comment was added to ticket "${payload.ticketSubject}".`,
      };
  }
}
```

```ts
// console-transport.ts
import type { NotificationMessage, Transport } from './transport.js';

export class ConsoleTransport implements Transport {
  async send(message: NotificationMessage): Promise<void> {
    console.log(
      `[notification] to=${message.to} subject=${JSON.stringify(message.subject)} body=${JSON.stringify(message.body)}`,
    );
  }
}
```

- [ ] **Step 5: Write `index.ts`** re-exporting the public surface (transport types, `ConsoleTransport`, `renderMessage`, `NotificationPayload`; `NotificationService` and `deliverNotification` are appended in Task 4).

- [ ] **Step 6: Run green** — `pnpm --filter @supportops/notifications test` (3 tests PASS). Do **not** commit yet; the package's `typecheck` needs `@supportops/queue` built and the DB harness lands in Task 4. Commit at the end of Task 4.

---

### Task 4: `packages/notifications` — service + delivery over a test DB (TDD, DB-backed)

**Files:**

- Create: `packages/notifications/test/{global-setup.ts,helpers.ts}`, `src/{notification.service.ts,notification.service.spec.ts,deliver.ts,deliver.spec.ts}`
- Modify: `packages/notifications/vitest.config.ts` (add the DB harness), `src/index.ts` (export the two new symbols)

**Interfaces:**

- Consumes: `prisma`, `Prisma`, `NotificationType` from `@supportops/db`; `NotificationProducer` from `@supportops/queue`; `renderMessage`/`NotificationPayload`, `Transport`.
- Produces:
  - `interface TicketEvent { orgId: string; recipientUserId: string; ticketId: string; ticketSubject: string }`
  - `class NotificationService { constructor(producer: NotificationProducer); ticketAssigned(e: TicketEvent): Promise<void>; ticketCommented(e: TicketEvent): Promise<void> }`
  - `deliverNotification(notificationId: string, transport: Transport): Promise<void>`

**Acceptance:** `ticketAssigned`/`ticketCommented` create exactly one `Notification` row (`EMAIL`, `PENDING`, correct `type`/`userId`) and enqueue once with `{ notificationId }`; when the producer rejects, the method still resolves and the row persists. `deliverNotification` sends the rendered message and sets `SENT` + `sentAt`; on a transport throw it sets `FAILED` (no `sentAt`) and rethrows; a missing notification is a no-op. All against a dedicated `supportops_notifications_test` database; no Redis.

- [ ] **Step 1: Add the DB harness** — `vitest.config.ts` (globals, `include: ['src/**/*.spec.ts']`, `globalSetup: ['./test/global-setup.ts']`, `fileParallelism: false`, `env.DATABASE_URL` pointing at `supportops_notifications_test`) and `test/global-setup.ts` (create + `prisma migrate deploy --schema ../db/prisma/schema.prisma`), mirroring `apps/api`. Add `test/helpers.ts` with `resetDb()` (TRUNCATE the domain tables) and `seedOrgUser()` (an org + one AGENT user).

- [ ] **Step 2: Write the failing service test** — `src/notification.service.spec.ts` with a `FakeProducer implements NotificationProducer` recording `add` calls and optionally rejecting. Assert: an assignment call creates a `PENDING` `TICKET_ASSIGNED` row for the user and `producer.added === [{ notificationId: row.id }]`; a comment call whose producer rejects still resolves and persists a `TICKET_COMMENTED` row (spy on `console.error`). Run → FAIL.

- [ ] **Step 3: Implement `notification.service.ts`** (persist awaited, enqueue best-effort). Cast the payload to `Prisma.InputJsonObject`:

```ts
import { prisma, Prisma, type NotificationType } from '@supportops/db';
import type { NotificationProducer } from '@supportops/queue';
import type { NotificationPayload } from './render.js';

export interface TicketEvent {
  orgId: string;
  recipientUserId: string;
  ticketId: string;
  ticketSubject: string;
}

export class NotificationService {
  constructor(private readonly producer: NotificationProducer) {}

  ticketAssigned(event: TicketEvent): Promise<void> {
    return this.emit('TICKET_ASSIGNED', event);
  }

  ticketCommented(event: TicketEvent): Promise<void> {
    return this.emit('TICKET_COMMENTED', event);
  }

  private async emit(type: NotificationType, event: TicketEvent): Promise<void> {
    const payload: NotificationPayload = {
      ticketId: event.ticketId,
      ticketSubject: event.ticketSubject,
    };
    const notification = await prisma.notification.create({
      data: {
        orgId: event.orgId,
        userId: event.recipientUserId,
        type,
        channel: 'EMAIL',
        payload: payload as unknown as Prisma.InputJsonObject,
        status: 'PENDING',
      },
    });
    void this.producer
      .add({ notificationId: notification.id })
      .catch((err: unknown) =>
        console.error(`[notifications] failed to enqueue ${notification.id}:`, err),
      );
  }
}
```

- [ ] **Step 4: Write the failing delivery test** — `src/deliver.spec.ts` with a `FakeTransport` (records sends; optionally throws). Assert `SENT` + `sentAt` on success (message addressed to the user's email), `FAILED` + rethrow on transport throw, and no-op for a random UUID. Run → FAIL.

- [ ] **Step 5: Implement `deliver.ts`**

```ts
import { prisma } from '@supportops/db';
import { renderMessage, type NotificationPayload } from './render.js';
import type { Transport } from './transport.js';

export async function deliverNotification(
  notificationId: string,
  transport: Transport,
): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { user: true },
  });
  if (!notification) return;

  const message = renderMessage({
    type: notification.type,
    recipientEmail: notification.user.email,
    payload: notification.payload as unknown as NotificationPayload,
  });

  try {
    await transport.send(message);
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  } catch (err) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'FAILED' },
    });
    throw err;
  }
}
```

- [ ] **Step 6: Export and run the whole package green**

Add to `src/index.ts`: `export { NotificationService, type TicketEvent } from './notification.service.js';` and `export { deliverNotification } from './deliver.js';`

```bash
docker compose up -d postgres
pnpm --filter @supportops/notifications test              # 8 tests
pnpm build                                                # builds queue → notifications
pnpm --filter @supportops/notifications typecheck
```

Expected: 8 tests PASS (render 2, console 1, service 2, deliver 3); typecheck exits 0 (needs `@supportops/queue` built first, hence `pnpm build`). Root lint + format clean.

- [ ] **Step 7: Commit**

```bash
git add packages/notifications
git commit -m "feat(notifications): notification service, delivery, and console transport

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `workers/notification-worker`

**Files:**

- Create: `workers/notification-worker/{package.json,tsconfig.json,src/main.ts}`

**Interfaces:**

- Consumes: `loadConfig` (`@supportops/config`); `createRedisConnection`, `createNotificationWorker` (`@supportops/queue`); `ConsoleTransport`, `deliverNotification` (`@supportops/notifications`).
- Produces: a runnable process (`start` → `node dist/main.js`) that consumes `NOTIFICATION_QUEUE_NAME` and delivers via the console transport.

**Acceptance:** the worker builds and typechecks and, when run against Redis + Postgres, logs `ready`, delivers enqueued notifications (rows move `PENDING → SENT`), logs job failures, and shuts down cleanly on `SIGINT`/`SIGTERM`. No unit test — the delivery logic is owned and tested by `packages/notifications`; `build`, `lint`, and `typecheck` gate this package.

- [ ] **Step 1: Scaffold** — `package.json` (`@supportops/notification-worker`, `"type": "module"`, scripts `build`/`start`/`lint`/`typecheck`; deps: the four workspace packages above; devDep `typescript`), `tsconfig.json` (extends base, `outDir dist`, `rootDir src`).

- [ ] **Step 2: Write `src/main.ts`** — resilient connection (default, not fail-fast), a `ConsoleTransport`, a worker whose processor calls `deliverNotification(job.data.notificationId, transport)`, `ready`/`failed` logging, and `SIGINT`/`SIGTERM` handlers that `await worker.close()` then `connection.disconnect()`.

```ts
import { loadConfig } from '@supportops/config';
import { createNotificationWorker, createRedisConnection } from '@supportops/queue';
import { ConsoleTransport, deliverNotification } from '@supportops/notifications';

const config = loadConfig();
const connection = createRedisConnection(config.REDIS_URL);
const transport = new ConsoleTransport();

const worker = createNotificationWorker(connection, (job) =>
  deliverNotification(job.data.notificationId, transport),
);

worker.on('ready', () => console.log('[notification-worker] ready'));
worker.on('failed', (job, err) =>
  console.error(`[notification-worker] job ${job?.id ?? '?'} failed:`, err),
);

async function shutdown(signal: string): Promise<void> {
  console.log(`[notification-worker] received ${signal}, shutting down`);
  await worker.close();
  connection.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
```

- [ ] **Step 3: Verify and commit**

```bash
pnpm install
pnpm --filter @supportops/notification-worker build
pnpm --filter @supportops/notification-worker typecheck
git add workers pnpm-lock.yaml
git commit -m "feat(worker): notification delivery worker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Emit `TICKET_ASSIGNED` from the tickets flows (TDD, integration)

**Files:**

- Create: `apps/api/src/notifications/notifications.module.ts`
- Modify: `apps/api/src/tickets/tickets.module.ts`, `apps/api/src/app.module.ts`, `apps/api/src/tickets/tickets.service.ts`, `apps/api/test/app.ts`, `apps/api/test/tickets.spec.ts`, `apps/api/package.json`

**Interfaces:**

- Consumes: `NotificationService` (`@supportops/notifications`); `createNotificationQueue`, `createRedisConnection`, `NotificationProducer` (`@supportops/queue`).
- Produces:
  - `NotificationsModule.register(config, opts?: { producer?: NotificationProducer })` providing and exporting `NotificationService`. Default producer = real BullMQ (`failFast`); `opts.producer` overrides it.
  - `interface NotificationsModuleOptions { producer?: NotificationProducer }`
  - `TicketsModule.register(config, opts?)` and `AppModule.register(config, opts?)` thread `opts` through.
  - `TicketsService` gains a `NotificationService` dependency and emits `TICKET_ASSIGNED` on create-with-assignee and on assignment change to a new non-null assignee.

**Acceptance:** creating a ticket with an `assigneeId` and reassigning to a new agent each create one `PENDING` `TICKET_ASSIGNED` row for that assignee; a team-only assignment creates none; reassigning to the same agent creates none. The API test suite runs with **no Redis** (a null producer is injected). All existing ticket tests stay green.

- [ ] **Step 1: Add API deps** — in `apps/api/package.json` dependencies add `"@supportops/notifications": "workspace:*"` and `"@supportops/queue": "workspace:*"`; run `pnpm install`.

- [ ] **Step 2: Write `NotificationsModule`** — `apps/api/src/notifications/notifications.module.ts`:

```ts
import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from '@supportops/config';
import { NotificationService } from '@supportops/notifications';
import {
  createNotificationQueue,
  createRedisConnection,
  type NotificationProducer,
} from '@supportops/queue';

const NOTIFICATION_PRODUCER = Symbol('NOTIFICATION_PRODUCER');

export interface NotificationsModuleOptions {
  producer?: NotificationProducer;
}

@Module({})
export class NotificationsModule {
  static register(config: AppConfig, opts: NotificationsModuleOptions = {}): DynamicModule {
    const producer =
      opts.producer ??
      createNotificationQueue(createRedisConnection(config.REDIS_URL, { failFast: true }));
    return {
      module: NotificationsModule,
      providers: [
        { provide: NOTIFICATION_PRODUCER, useValue: producer },
        {
          provide: NotificationService,
          useFactory: (p: NotificationProducer) => new NotificationService(p),
          inject: [NOTIFICATION_PRODUCER],
        },
      ],
      exports: [NotificationService],
    };
  }
}
```

- [ ] **Step 3: Thread the module + options** — `TicketsModule.register(config, opts = {})` imports `NotificationsModule.register(config, opts)`; `AppModule.register(config, opts = {})` passes `opts` to `TicketsModule.register`. Import `NotificationsModuleOptions` as a `type`.

- [ ] **Step 4: Inject the null producer in tests** — in `apps/api/test/app.ts`, build the app with `AppModule.register(config, { producer: { add: async () => {}, close: async () => {} } })` (typed `NotificationProducer`) so the suite opens no Redis connection.

- [ ] **Step 5: Write the failing assertions** — extend `apps/api/test/tickets.spec.ts` (reusing `seedOrgWithAgent`/`createTicket`), asserting via `prisma.notification`:

```ts
it('records a TICKET_ASSIGNED notification when a ticket is assigned to an agent', async () => {
  const { token, customerId, agentId } = await seedOrgWithAgent('acme');
  const id = await createTicket(token, customerId);
  await request(app.getHttpServer())
    .patch(`/tickets/${id}/assignment`)
    .set('Authorization', `Bearer ${token}`)
    .send({ assigneeId: agentId })
    .expect(200);

  const rows = await prisma.notification.findMany({ where: { type: 'TICKET_ASSIGNED' } });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ userId: agentId, status: 'PENDING' });
});

it('does not notify on a team-only assignment', async () => {
  const { token, customerId, orgId, agentId } = await seedOrgWithAgent('acme');
  const team = await prisma.team.create({
    data: { orgId, name: 'Support', leadUserId: agentId },
  });
  const id = await createTicket(token, customerId);
  await request(app.getHttpServer())
    .patch(`/tickets/${id}/assignment`)
    .set('Authorization', `Bearer ${token}`)
    .send({ teamId: team.id })
    .expect(200);
  expect(await prisma.notification.count()).toBe(0);
});
```

Run `pnpm --filter @supportops/api test -- tickets.spec` → FAIL (no rows / DI not wired).

- [ ] **Step 6: Emit from `TicketsService`** — inject `NotificationService`; after `create`, if `ticket.assigneeId` is set, `await this.notifications.ticketAssigned({ orgId, recipientUserId: ticket.assigneeId, ticketId: ticket.id, ticketSubject: ticket.subject })`; in `assign`, capture the pre-update row and emit only when `ticket.assigneeId && ticket.assigneeId !== before.assigneeId`.

- [ ] **Step 7: Run green + commit**

```bash
docker compose up -d postgres
pnpm --filter @supportops/api test
pnpm build && pnpm --filter @supportops/api typecheck
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): emit ticket assignment notifications

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Emit `TICKET_COMMENTED` from the comment flow (TDD, integration)

**Files:**

- Modify: `apps/api/src/tickets/ticket-comments.service.ts`, `apps/api/test/tickets.spec.ts`

**Interfaces:**

- Consumes: `NotificationService`.
- Produces: `TicketCommentsService` emits `TICKET_COMMENTED` to the ticket's assignee after a comment, unless the assignee performed the action or the ticket is unassigned.

**Acceptance:** commenting on a ticket assigned to another agent creates one `PENDING` `TICKET_COMMENTED` row for that assignee; the assignee commenting on their own ticket creates none; commenting on an unassigned ticket creates none.

- [ ] **Step 1: Write the failing assertions** — extend `apps/api/test/tickets.spec.ts`:

```ts
it('notifies the assignee when someone else comments', async () => {
  const { token, customerId, orgId } = await seedOrgWithAgent('acme');
  const assignee = await prisma.user.create({
    data: { orgId, email: 'lee@acme.test', name: 'Lee', role: 'AGENT', passwordHash: 'x' },
  });
  const id = await createTicket(token, customerId);
  await request(app.getHttpServer())
    .patch(`/tickets/${id}/assignment`)
    .set('Authorization', `Bearer ${token}`)
    .send({ assigneeId: assignee.id })
    .expect(200);

  await request(app.getHttpServer())
    .post(`/tickets/${id}/comments`)
    .set('Authorization', `Bearer ${token}`) // the caller is not the assignee
    .send({ body: 'Any update?' })
    .expect(201);

  const rows = await prisma.notification.findMany({ where: { type: 'TICKET_COMMENTED' } });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ userId: assignee.id, status: 'PENDING' });
});

it('does not notify when the assignee comments on their own ticket', async () => {
  const { token, customerId, agentId } = await seedOrgWithAgent('acme');
  const id = await createTicket(token, customerId);
  await request(app.getHttpServer())
    .patch(`/tickets/${id}/assignment`)
    .set('Authorization', `Bearer ${token}`)
    .send({ assigneeId: agentId })
    .expect(200);
  await prisma.notification.deleteMany(); // clear the assignment notification
  await request(app.getHttpServer())
    .post(`/tickets/${id}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body: 'Working on it' })
    .expect(201);
  expect(await prisma.notification.count({ where: { type: 'TICKET_COMMENTED' } })).toBe(0);
});
```

Run → FAIL.

- [ ] **Step 2: Emit from `TicketCommentsService`** — inject `NotificationService`; after creating the comment, if `ticket.assigneeId && ticket.assigneeId !== actorUserId`, `await this.notifications.ticketCommented({ orgId, recipientUserId: ticket.assigneeId, ticketId: ticket.id, ticketSubject: ticket.subject })`.

- [ ] **Step 3: Run green + commit**

```bash
pnpm --filter @supportops/api test
git add apps/api
git commit -m "feat(api): emit ticket comment notifications

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Document the architecture and open the PR

**Files:**

- Modify: `docs/architecture.md`, `CLAUDE.md`

**Acceptance:** `docs/architecture.md` describes `packages/queue`, `packages/notifications`, `workers/`, and the async delivery flow (persist → enqueue → worker → transport), linking ADRs 0013/0014; `CLAUDE.md` gains a short "Background work" invariant. The whole workspace is green and the PR targets `develop`.

- [ ] **Step 1: Update `docs/architecture.md`** — add the two packages and the `workers/` layer to the layout list; add a short "Notifications" subsection describing the persist-then-enqueue flow, the pluggable transport (console today), and best-effort enqueue; link the ADRs. Match the surrounding prose.

- [ ] **Step 2: Update `CLAUDE.md`** — add under a new "Background work" heading: background jobs go through `packages/queue` (BullMQ); a new notification registers a `NotificationType` and is rendered in `packages/notifications`; notification emission is best-effort and must never fail the triggering request.

- [ ] **Step 3: Full green + format**

```bash
docker compose up -d postgres
pnpm build && pnpm typecheck && pnpm lint && pnpm test
pnpm exec prettier --check .
```

Expected: every package builds, typechecks, lints, and tests green; format clean.

- [ ] **Step 4: Commit, push, open the PR**

```bash
git add docs CLAUDE.md
git commit -m "docs: document the notifications and queue architecture

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push -u origin HEAD
gh pr create --base develop \
  --title "feat: notifications and queue" \
  --body "Adds asynchronous ticket notifications: a BullMQ queue (packages/queue), a notification domain with a pluggable transport (packages/notifications), and a delivery worker (workers/notification-worker). Ticket assignment and comments now record a Notification and enqueue delivery; a worker sends via the console transport and records SENT/FAILED. Enqueue is best-effort so a Redis outage never fails a ticket action. Decisions in ADRs 0013 and 0014. No schema migration (the notifications table and its enums already existed). Domain logic is unit-tested against a real Postgres and the assignment/comment flows are covered by integration tests; no test requires Redis."
```

Expected: CI (typecheck, lint, test — Postgres service, no Redis) goes green on the PR.

---

## Notes for the executor

- `docker compose up -d postgres` once per session for DB-backed tests. **Redis is not needed by any test.**
- No Prisma migration: the `notifications` table and its enums already exist in the schema.
- Run `pnpm build` before a per-package `typecheck` so workspace type declarations resolve (or use the root `pnpm typecheck`, which builds dependencies first via Turborepo).
- Keep every commit green (`pnpm test` + `pnpm exec eslint .` + `pnpm exec prettier --check .`).
- Feature branch off `develop` (`feat/notifications-and-queue`); never commit to `develop` directly.
