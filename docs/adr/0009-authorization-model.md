# 0009 — Authorization model and rule placement

- **Status:** Accepted
- **Date:** 2026-08-22

## Context

The management endpoints (organizations, users, teams, customers) must enforce
who may do what. Roles are `OWNER`, `ADMIN`, `TEAM_LEAD`, `AGENT`. Some rules are
coarse ("only owners and admins may create users"); others are conditional and
depend on the data ("a team lead may only manage their own team", "the last owner
cannot be removed"). We need one predictable, testable place for each kind.

## Decision

- **Coarse gating lives on controllers.** `@Roles(...)` plus `RolesGuard`
  declares which roles may reach an endpoint. Reads are open to all authenticated
  roles; structural mutations are `OWNER`/`ADMIN`; customer records are writable by
  every role; team membership is additionally reachable by `TEAM_LEAD`.
- **Conditional rules live in services**, beside the query they constrain:
  organization scoping on every query, privilege-escalation limits, "own team"
  confinement, uniqueness, and last-owner protection. Each becomes a plain service
  unit test. We deliberately do not add a declarative policy/ability layer: the
  rule set is small and concrete, and keeping each rule next to its query is the
  simplest thing that is fully testable.
- **The permission matrix:**

  | Endpoint                                     | OWNER | ADMIN | TEAM_LEAD     | AGENT |
  | -------------------------------------------- | ----- | ----- | ------------- | ----- |
  | `GET /orgs/me`                               | yes   | yes   | yes           | yes   |
  | `PATCH /orgs/me`                             | yes   | yes   | –             | –     |
  | `GET /users`, `GET /users/:id`               | yes   | yes   | yes           | yes   |
  | `POST/PATCH/DELETE /users`, `/role`, `/team` | yes   | yes   | –             | –     |
  | `GET /teams`, `GET /teams/:id`               | yes   | yes   | yes           | yes   |
  | `POST/DELETE /teams`, `PATCH` name/lead      | yes   | yes   | –             | –     |
  | `PATCH /teams/:id/members`                   | yes   | yes   | own team only | –     |
  | `GET/POST/PATCH/DELETE /customers`           | yes   | yes   | yes           | yes   |
  | `PATCH /users/me`, `/users/me/password`      | yes   | yes   | yes           | yes   |

- **Escalation guards:** only an `OWNER` may create an `OWNER`, grant the `OWNER`
  role, or change a user who is currently an `OWNER`; the last `OWNER` of an
  organization can never be demoted or deleted; a user cannot delete themselves.
- **Cross-tenant access returns 404, not 403.** An organization-scoped query for
  another tenant's row simply finds nothing, so existence elsewhere is never
  revealed.
- **Initial passwords are set by the creating administrator.** The create-user
  request carries a validated initial password, hashed with argon2id; the user can
  change it through self-service (`PATCH /users/me/password`). There is no email
  invitation flow at this time; should one become a real need, that is a future,
  separately recorded decision.

## Consequences

- A new endpoint's coarse access is one decorator, visible in review; its
  conditional rules are service unit tests.
- The organization slug is the tenant identity used at login, so it is immutable
  via `PATCH /orgs/me` (name and timezone are editable).
- An administrator briefly knows a user's initial password; a forced-change flag
  can tighten this later without changing the surface.
