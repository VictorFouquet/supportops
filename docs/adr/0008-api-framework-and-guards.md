# 0008 — API framework and authorization guards

- **Status:** Accepted
- **Date:** 2026-08-22

## Context

We need an HTTP framework for `apps/api` that gives us a clear module boundary per
domain, dependency injection, and first-class request validation, and that a new
contributor can read without surprises. Authorization must be declarative and impossible
to forget on a new route.

## Decision

- **NestJS** is the API framework. One module per domain; the flow is always
  `Controller → Service → Prisma`, with Prisma confined to services.
- **Authorization is guard-based and passport-free.** A `JwtAuthGuard` verifies the
  bearer token with `@nestjs/jwt` and attaches a typed principal to the request; a
  `RolesGuard` reads a `@Roles(...)` decorator and enforces it. Both live in
  `@supportops/auth` and are reused everywhere; we do not add Passport for a single
  stateless strategy.
- **Validation is global.** A global `ValidationPipe` (`whitelist`,
  `forbidNonWhitelisted`, `transform`) rejects unknown or malformed fields; request
  shapes are `class-validator` DTOs.
- **Errors are mapped centrally.** Typed domain errors are translated to HTTP status
  codes by a global exception filter, so services throw meaning, not status codes, and
  no stack trace or Prisma detail reaches a client.
- **Tests run on Vitest** (consistent with the rest of the monorepo) using
  `unplugin-swc` so decorator metadata is emitted for Nest's DI; endpoints are covered
  with `supertest` against a real Postgres.

## Consequences

- A new endpoint is a controller method plus a service method plus a DTO; authorization
  is one decorator, and forgetting it is visible in review.
- The app depends on emitted decorator metadata, so both the build (`tsc`) and the test
  runner (`swc`) must enable it; this is configured once per package.
- Swapping the framework later would touch controllers and guards but not the domain
  services, which hold no framework types.
