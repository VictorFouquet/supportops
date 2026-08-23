# 0013 — Asynchronous notifications via a queue and worker

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

Agents need to be told when a ticket lands on them or gains activity. Sending
those messages inline with the request that triggers them would tie a ticket
assignment or a customer comment to the availability and latency of whatever
delivers the message. We want notifications that are decoupled from the request,
survive a delivery backend hiccup, and leave a queryable record of what was meant
to be sent and what happened.

## Decision

- **Persist, then enqueue.** A ticket action writes a `Notification` row with
  status `PENDING`, then enqueues a job carrying only the `notificationId`. The
  row is the source of truth; the job is a delivery trigger that cannot drift from
  it.
- **A background worker delivers.** `workers/notification-worker` consumes jobs,
  loads the notification, sends it through a `Transport`, and marks the row `SENT`
  (with `sent_at`) or `FAILED`. Today the only transport is a `ConsoleTransport`
  that logs the message; the `Transport` interface is shaped so a real email
  transport drops in later without touching callers.
- **The queue is BullMQ on Redis**, isolated in `packages/queue`; the notification
  domain (service, renderer, delivery, transport) lives in
  `packages/notifications`.
- **Enqueue is best-effort.** Writing the `Notification` row is awaited and is the
  durable outcome. The enqueue that follows may not fail the originating request:
  its error is caught and logged, and the Redis connection is configured to fail
  fast rather than buffer or reconnect forever. A degraded notification backend
  degrades notifications, never ticket work.

## Consequences

- Ticket assignment and commenting stay fast and never return a `500` because of
  a notification problem.
- Every notification has a persisted record and a terminal `SENT`/`FAILED` status,
  so delivery is auditable and re-delivery is idempotent against the row.
- Background processing now has a home (`packages/queue` + `workers/`); future
  background work uses it rather than inventing a second mechanism.
- A `PENDING` row whose enqueue was dropped during an outage is not retried
  automatically in this iteration; it remains a visible record that a later sweep
  could re-enqueue.
