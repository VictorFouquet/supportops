# 0014 — Notification triggers and recipients

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

Given the delivery mechanism (see
[ADR 0013](./0013-asynchronous-notifications.md)), we must decide which ticket
events raise a notification and who receives each one. A `Notification` has a
required `user_id`, so every notification must resolve to exactly one recipient
who is a real agent in the ticket's organization.

## Decision

- **`TICKET_ASSIGNED`** is raised when a ticket gains or changes its **agent
  assignee** — on creation with an `assigneeId`, and on an assignment change that
  sets `assigneeId` to a new, non-null user. The recipient is the new assignee.
- **`TICKET_COMMENTED`** is raised when a comment is added. The recipient is the
  ticket's **current assignee**, and it is skipped when that assignee wrote the
  comment (no one is notified of their own comment) or when the ticket has no
  assignee. It is raised for internal notes and on-behalf comments alike — a
  comment is activity the assignee should see regardless of its `authorType` or
  `isInternal` flag.
- **Team-only assignment and unassignment raise nothing.** Assigning a ticket to a
  team without an agent has no single user to notify, and `user_id` cannot be null;
  clearing an assignment likewise has no recipient.

## Consequences

- Every notification has an unambiguous recipient who is always a real, same-org
  user; `user_id` is never a placeholder.
- Agents are told when a ticket becomes their responsibility and when a ticket
  they own moves, without the noise of being notified about their own actions.
- Fanning a team assignment out to every member (or to the lead) is deliberately
  left out; if team-level notification is wanted later it is a separate decision
  with its own recipient policy.
