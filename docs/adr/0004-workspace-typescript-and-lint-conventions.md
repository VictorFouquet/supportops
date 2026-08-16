# 0004 — Workspace TypeScript and lint conventions

- **Status:** Accepted
- **Date:** 2026-08-16

## Context

Adding the first shared library (`packages/config`) surfaced three workspace-wide
choices that were not yet settled: how packages obtain Node's ambient types, how we
treat intentionally-unused bindings, and where the task runner keeps its local cache.
Settling them once, at the root, keeps every future package consistent instead of
re-deciding them package by package.

## Decision

- **Node types live at the root.** `@types/node` is a root dev dependency, so every
  workspace package resolves `process`, the `NodeJS` namespace, and other ambient Node
  types without declaring them individually. Its major tracks the runtime (Node 24 —
  see [ADR 0002](./0002-node-version-policy.md)).
- **Intentionally-unused bindings are underscore-prefixed.**
  `@typescript-eslint/no-unused-vars` is configured to ignore identifiers matching `^_`
  (variables, arguments, and caught errors). Dropping a field by destructuring, or
  accepting an argument only for its position, is written with a leading underscore
  rather than silenced with an inline disable comment.
- **The task runner cache is not source.** Turborepo's `.turbo/` directory is excluded
  from git and from formatting, alongside build output (`dist/`, `.next/`, `coverage/`)
  and the generated lockfile.

## Consequences

- New packages type-check against Node globals with no per-package `@types/node`.
- A leading underscore reads as "deliberately unused"; the linter stays strict for
  everything else, so a genuinely dead binding is still caught.
- `git status` and `prettier --check` stay signal — neither surfaces machine-generated
  cache.
