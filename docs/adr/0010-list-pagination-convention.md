# 0010 — List and pagination convention

- **Status:** Accepted
- **Date:** 2026-08-22

## Context

Every collection endpoint needs a consistent, predictable way to page and filter.
Choosing one shape now and reusing it everywhere keeps clients uniform and tests
simple as more collections appear.

## Decision

- **Offset pagination with a fixed envelope.** List endpoints accept
  `?page=` (default 1) and `?pageSize=` (default 20, capped at 100), plus an
  optional `?q=` free-text filter, and respond with
  `{ data, page, pageSize, total }`.
- **A single shared helper** (`common/pagination.ts`) owns the `PageQueryDto`
  (validated, coerced query params), the `Paginated<T>` shape, and a `paginate()`
  function that turns a `count` + `findMany({ skip, take })` pair into the
  envelope. Every list reuses it.

## Consequences

- Clients can jump to any page and always read `total`; the shape is trivial to
  assert in tests.
- Offset paging is adequate for the data volumes here. If a very large, rapidly
  changing collection later needs stable cursoring, that is a separate decision
  layered onto the same endpoints.
