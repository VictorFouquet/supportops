# 0012 — Ticket authorization, assignment, and comment authorship

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

Working tickets is the core job of every agent, whatever their role. We need to
decide who may act on tickets, how assignment is validated, and how comments
capture who is speaking — bearing in mind that customers are not users of this
system and cannot sign in.

## Decision

- **Tickets are reachable by every authenticated role.** The coarse guard is
  `JwtAuthGuard` alone (no `@Roles` restriction) for reading, creating,
  updating, assigning, transitioning, and commenting. This mirrors how customer
  records are already writable by every role.

- **Organization isolation is the real protection**, enforced in the service:
  every ticket, customer, assignee, and team is looked up scoped by the caller's
  organization; anything in another organization is invisible and yields **404,
  never 403**.

- **Assignment is nullable and validated.** `assigneeId` must be a user in the
  same organization and `teamId` a team in the same organization; either may be
  set to `null` to unassign. Assignment has its own endpoint
  (`PATCH /tickets/:id/assignment`).

- **Tickets are not deletable.** `CLOSED` is the terminal record state; support
  tickets are kept as history rather than purged.

- **Comments are always created by the authenticated agent.** `authorType`
  records whether a comment is the agent speaking (`AGENT`, the default) or the
  agent recording something on the customer's behalf (`CUSTOMER`) — for example
  logging a phone call or pasting in a forwarded email; there is no customer
  sign-in. `isInternal` marks a comment as an agent-only note. Comments are
  append-only in this iteration (no edit or delete).

## Consequences

- The permission surface for tickets is trivial to reason about: one guard, plus
  organization scoping proven by unit tests.
- `authorType` keeps agent- and customer-originated messages distinguishable in a
  ticket's history even though only agents authenticate.
- Should a customer-facing portal ever be introduced, customer-authored comments
  and their authentication become a separate, separately recorded decision.
