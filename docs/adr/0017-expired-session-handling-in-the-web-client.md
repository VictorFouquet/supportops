# 0017 — Handling an expired session in the web client

- **Status:** Accepted
- **Date:** 2026-08-29

## Context

The web client keeps the access token in an httpOnly cookie and calls the API
only from the Next server (see
[ADR 0016](./0016-session-httponly-cookie-bff.md)). That cookie has no explicit
lifetime, but the JWT it carries does: the token can expire while the cookie is
still present in the browser.

When that happens, the middleware that guards the app routes still sees a cookie
and lets the request through, and the first server-side API call the page makes —
loading the current user, or a list — comes back `401`. Left unhandled, that
rejection surfaces as a generic server error page, and the stale cookie is never
cleared, so the viewer is stuck: every refresh hits the same error. A logged-in
person whose token merely lapsed should be returned to the login screen, not shown
a crash.

The obvious fix — clear the cookie and redirect where the `401` is caught — runs
into a framework constraint: a Server Component render cannot mutate cookies
(`cookies()` is read-only during render), so the page that catches the `401` cannot
clear the cookie itself.

## Decision

- **A server-side `401` from a first data load is treated as an expired session.**
  The authenticated app layout wraps its "load the current user" call; if that call
  throws the API's `401`, the layout redirects to a dedicated expiry route. Any
  other error is re-thrown unchanged, so genuine failures still surface as errors
  rather than being mistaken for a lapsed session.
- **A small route handler owns cookie clearing.** `GET /api/session/expire` clears
  the session cookie and redirects to `/login`. Route handlers _can_ mutate
  cookies, so this is where the removal happens; the middleware matcher already
  excludes `/api/session/*`, so the route stays reachable even while the session is
  expired.
- **The redirect is issued from the catch, and nothing swallows it.** The
  framework's redirect works by throwing a control-flow signal; the layout calls it
  only inside the `401` branch and lets it propagate, so a redirect is never caught
  and turned back into an error.

## Consequences

- A viewer whose token has expired is quietly returned to the login screen with the
  stale cookie removed, instead of landing on an error page they cannot escape by
  refreshing.
- Cookie clearing lives in one place (the expiry route), consistent with logout,
  rather than being attempted — and failing — inside a Server Component.
- The redirect costs one extra request hop (page → expiry route → login) on the
  first load after expiry. This happens once per lapse and is invisible to the
  viewer beyond the redirect itself.
- The layout distinguishes only `401` from every other error. A different auth
  failure that the API also expressed as `401` would be handled the same way — sent
  to re-authenticate — which is the correct default for this client.
