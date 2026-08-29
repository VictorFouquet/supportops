# 0016 — Session as an httpOnly cookie via a server-side BFF

- **Status:** Accepted
- **Date:** 2026-08-29

## Context

The API authenticates with a bearer JWT (see
[ADR 0007](./0007-authentication-strategy.md)). Now that a web client exists
(see [ADR 0015](./0015-web-client-next-app-router.md)), we need to decide where
that token lives and how the browser gets authenticated requests to the API.

## Decision

- **The access token is stored in an httpOnly, `SameSite=Lax` cookie**, set by a
  login route handler in `apps/web` after it calls the API's login endpoint. No
  script running in the browser can read or exfiltrate it.
- **The Next server is the only caller of the API.** Every request that needs
  data — server component reads and route handler mutations alike — reads the
  cookie on the server, attaches it as a `Bearer` header, and calls the API from
  there.
- **The browser never calls the API directly** and never holds the token in
  memory, `localStorage`, or a readable cookie. It only ever talks to `apps/web`.

## Consequences

- No token is exposed to injected script; an XSS in the web app cannot steal the
  session, only misuse the current page's own requests.
- The API's origin stays private to the Next server, so no CORS surface is
  opened for browser-to-API calls.
- There is a single server-side place that talks to the API, which every screen
  reuses, rather than each page or component owning its own fetch-and-auth
  logic.
- The web server is now in the request path for every API call the UI makes; an
  outage of `apps/web` takes the UI down even if the API is healthy.
