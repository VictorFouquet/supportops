# 0002 — Node version policy: current LTS, floor at 20

- **Status:** Accepted
- **Date:** 2026-08-16

## Context

Runtime drift between developer machines and CI is a common source of "works on my
machine" failures. We need a single, predictable Node version, but we also do not
want to hard-block a contributor whose machine is still on the previous LTS.

## Decision

Run the **current active LTS, Node 24**, in development and CI.

- `.nvmrc` pins `24`, so `nvm use` selects it automatically.
- `engines.node` is set to `>=20`, floored at the previous LTS rather than locked to
  a single major. This keeps contributors on Node 20 unblocked while everyone targets
  24 by default.
- CI provisions Node 24, matching local development.

## Consequences

- Local and CI runtimes match, removing a class of environment-specific failures.
- Any dependency we add must support Node 20 and up.
- When the next LTS lands, this record is superseded by a new one bumping `.nvmrc`
  and CI, and — if needed — the `engines` floor.
