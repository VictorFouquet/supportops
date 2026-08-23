# 0007 — Authentication strategy

- **Status:** Accepted
- **Date:** 2026-08-22

## Context

The API is stateless and consumed by a browser client and, later, other services.
Users belong to exactly one organization, and the same email address may exist in two
different organizations (`users` is unique on `(org_id, email)`, not on `email` alone).
We need to authenticate a request cheaply on every call without a shared session store,
and we must not leak whether a given account exists.

## Decision

- **Passwords are hashed with argon2id** via `@node-rs/argon2` (prebuilt native
  bindings, no node-gyp build step). Defaults are accepted; plaintext is never stored
  or logged.
- **Sessions are stateless access JWTs.** `POST /auth/login` returns a single signed
  token with claims `{ sub, org, role }` and a one-hour expiry. There is no refresh
  token and no server-side session; a client re-authenticates when the token expires.
  Should long-lived sessions become a real need, that is a future, separately recorded
  decision.
- **Login is tenant-aware.** The caller supplies the organization slug alongside email
  and password; we resolve the organization, then the user within it. This respects the
  `(org_id, email)` uniqueness and keeps every lookup org-scoped.
- **No account enumeration.** Unknown organization, unknown email, and wrong password
  return an identical `401`, and login verifies against a dummy hash when no user is
  found so response time does not reveal existence.

## Consequences

- Any node can validate a token with only the signing secret; there is nothing to
  replicate or invalidate centrally, and logout is a client concern.
- A leaked token is valid until it expires; the one-hour lifetime bounds that exposure.
- The signing secret (`JWT_SECRET`) is required configuration and is validated at
  startup (minimum length) by `@supportops/config`.
