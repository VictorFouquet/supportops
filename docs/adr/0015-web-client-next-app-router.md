# 0015 — Web client: a separate Next.js App Router app

- **Status:** Accepted
- **Date:** 2026-08-29

## Context

The API has been built API-first (see [ADR 0008](./0008-api-framework-and-guards.md))
and has no server-rendered views of its own. We now need a web UI for agents to
work tickets, and we need to decide how it is built and where it lives relative
to the API.

## Decision

- **The web client is a separate Next.js app**, `apps/web`, built on the App
  Router. It is its own deployable unit that talks to the API over HTTP rather
  than sharing a process or a database connection with it.
- **Reads happen in server components.** Pages fetch data on the server as part
  of rendering, rather than shipping a client-side data-fetching layer for the
  initial view.
- **Mutations go through route handlers.** Actions that change data (creating a
  ticket, adding a comment, changing an assignment) are submitted to route
  handlers under `apps/web`, which call the API; the browser never calls the API
  for a mutation directly.
- **Styling is Tailwind CSS with a small set of local UI components**, not a
  third-party component library. Buttons, form fields, and layout primitives are
  written and owned in `apps/web`, kept just large enough to cover the screens
  that exist.

## Consequences

- Front and back stay cleanly separated and independently deployable: the API
  has no knowledge of how or whether it is rendered, and the web app can be
  redeployed, scaled, or rolled back without touching the API.
- Server components keep the initial render simple and fast, at the cost of
  needing route handlers as an explicit seam for anything that writes data.
- A local component set keeps the UI's visual surface small and consistent
  early on, at the cost of building basics (inputs, dialogs, tables) by hand
  instead of pulling them in; if the surface grows substantially, adopting a
  library later is a separate decision.
