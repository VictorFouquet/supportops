# 0005 — Branch strategy and continuous integration

- **Status:** Accepted
- **Date:** 2026-08-16

## Context

We want `main` to be releasable at all times and every change to it to have been
reviewed. Nothing — human or automated — should push straight to a shared branch. We
also want continuous integration to gate work before it merges, not after, and to run
the same toolchain as local development so "green locally" means "green in CI."

## Decision

- **`main` is protected and always releasable.** It advances only through a reviewed
  pull request; there are no direct pushes.
- **`develop` is the integration branch.** Work converges there; feature branches open
  pull requests into `develop`, and `develop` is promoted to `main` through its own
  reviewed pull request.
- **CI runs `typecheck`, `lint`, and `test`** on every push to `develop` and on every
  pull request targeting `develop` or `main`. Because `main` is reached only through a
  reviewed `develop → main` PR that CI has already gated, a post-merge run on `main` is
  redundant and is not configured.
- **CI provisions pnpm from the `packageManager` field**, not a hardcoded version, so
  it uses the exact pinned pnpm (9.7.0) and never drifts from local. Node matches local
  at 24 (see [ADR 0002](./0002-node-version-policy.md)).

## Consequences

- Nothing lands on `develop` or `main` without a passing pipeline and a review.
- Bumping pnpm is a one-line change to `packageManager`; CI follows automatically.
- Feature branches are cheap and expected; the shared branches stay clean and gated.
