# Architecture Decision Records

We record significant decisions here so their context and trade-offs outlive the
people who made them. Anyone joining the codebase should be able to read why it is
shaped the way it is, not just how.

Format follows [Michael Nygard's ADRs](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
one decision per file, numbered, each with **Context**, **Decision**, and
**Consequences**. Records are append-only — once a record is `Accepted`, supersede it
with a new one rather than rewriting history.

| #    | Title                                          | Status   |
| ---- | ---------------------------------------------- | -------- |
| 0001 | Adopt a pnpm + Turborepo TypeScript monorepo   | Accepted |
| 0002 | Node version policy: current LTS, floor at 20  | Accepted |
| 0003 | ESM-first toolchain and formatting conventions | Accepted |
