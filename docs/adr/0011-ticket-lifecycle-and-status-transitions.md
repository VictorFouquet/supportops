# 0011 — Ticket lifecycle and status transitions

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

Tickets move through a lifecycle: `OPEN`, `PENDING` (waiting on the customer),
`RESOLVED` (an agent believes the work is done), and `CLOSED`. Left
unconstrained, a status field invites nonsensical jumps (for example straight
from `CLOSED` back to `RESOLVED`) and inconsistent bookkeeping about when a
ticket was closed. We want one predictable place that defines which moves are
allowed and keeps the closed timestamp correct.

## Decision

- **A single legal-transition map in `TicketsService`** is the authority on
  allowed moves:
  - `OPEN → PENDING, RESOLVED`
  - `PENDING → OPEN, RESOLVED`
  - `RESOLVED → OPEN` (reopen), `CLOSED`
  - `CLOSED → OPEN` (reopen)

  An illegal transition raises `ConflictError` (409); the message names the
  offending move.

- **`closedAt` is maintained only by the transition logic** — set to the current
  time when a ticket enters `CLOSED`, cleared when a ticket leaves `CLOSED`. It
  is never edited directly.

- **Status changes go through a dedicated endpoint** (`PATCH /tickets/:id/status`),
  separate from editing a ticket's subject, description, or priority, so the
  transition rules live in exactly one place.

## Consequences

- Every allowed edge is a one-line service unit test; every rejected edge is a
  clean 409.
- Reopening a resolved or closed ticket is a first-class move, so agents never
  create duplicate tickets just to continue work.
- `closedAt` reliably reflects the most recent close and is `null` whenever a
  ticket is active.
