# Architecture Decision Records

We record significant decisions here so their context and trade-offs outlive the
people who made them. Anyone joining the codebase should be able to read why it is
shaped the way it is, not just how.

Format follows [Michael Nygard's ADRs](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
one decision per file, numbered, each with **Context**, **Decision**, and
**Consequences**. Records are append-only — once a record is `Accepted`, supersede it
with a new one rather than rewriting history.

| #    | Title                                               | Status   |
| ---- | --------------------------------------------------- | -------- |
| 0001 | Adopt a pnpm + Turborepo TypeScript monorepo        | Accepted |
| 0002 | Node version policy: current LTS, floor at 20       | Accepted |
| 0003 | ESM-first toolchain and formatting conventions      | Accepted |
| 0004 | Workspace TypeScript and lint conventions           | Accepted |
| 0005 | Branch strategy and continuous integration          | Accepted |
| 0006 | Prisma commands receive DATABASE_URL explicitly     | Accepted |
| 0007 | Authentication strategy                             | Accepted |
| 0008 | API framework and authorization guards              | Accepted |
| 0009 | Authorization model and rule placement              | Accepted |
| 0010 | List and pagination convention                      | Accepted |
| 0011 | Ticket lifecycle and status transitions             | Accepted |
| 0012 | Ticket authorization, assignment, and comments      | Accepted |
| 0013 | Asynchronous notifications via queue and worker     | Accepted |
| 0014 | Notification triggers and recipients                | Accepted |
| 0015 | Web client: a separate Next.js App Router app       | Accepted |
| 0016 | Session as an httpOnly cookie via a server-side BFF | Accepted |
