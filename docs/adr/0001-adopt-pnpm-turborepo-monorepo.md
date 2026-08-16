# 0001 — Adopt a pnpm + Turborepo TypeScript monorepo

- **Status:** Accepted
- **Date:** 2026-08-16

## Context

SupportOps is one product delivered as several moving parts: a REST API, a web
front end, background workers, and shared libraries (config, database access, auth,
notifications, queueing) that all of them depend on. Keeping these in separate
repositories would mean version-skew between the shared libraries and their
consumers, cross-repo pull requests for any change that spans a boundary, and
duplicated tooling. We want one dependency graph, atomic changes across boundaries,
and a single place to run type-checking, linting, and tests.

## Decision

Use a single repository — a **pnpm** workspace orchestrated by **Turborepo**.

- Workspace globs: `apps/*` (deployables), `packages/*` (shared libraries),
  `workers/*` (background processors).
- TypeScript everywhere, `strict` plus `noUncheckedIndexedAccess`, via a shared
  `tsconfig.base.json` that packages extend.
- The pnpm version is pinned with the `packageManager` field and provisioned through
  Corepack, so every contributor and CI runner uses the same package manager build.
- Turborepo owns the task graph (`build`, `test`, `lint`, `typecheck`) with
  `^build` dependencies so libraries build before their consumers.

## Consequences

- Contributors enable Corepack once; they do not install pnpm globally or guess a
  version.
- A change touching a shared library and its consumers is one commit, one PR, one CI
  run.
- Task results are cached by Turborepo, so unaffected packages are not rebuilt or
  retested.
- New shared code has an obvious home (`packages/*`); new deployables go in `apps/*`.
