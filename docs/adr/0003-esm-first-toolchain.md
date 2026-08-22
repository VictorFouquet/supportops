# 0003 — ESM-first toolchain and formatting conventions

- **Status:** Accepted
- **Date:** 2026-08-16

## Context

Our tooling — ESLint's flat configuration and Vitest — is authored for ES modules.
Leaving the workspace root as CommonJS makes Node reparse `eslint.config.js` as a
module on every run and emit a `MODULE_TYPELESS_PACKAGE_JSON` warning, and it invites
inconsistency about which files are ESM. We also want formatting to be automatic and
uncontested, without churning generated files.

## Decision

Standardize on ESM at the workspace root and fix the formatting surface.

- The root `package.json` declares `"type": "module"`; config files (`eslint.config.js`)
  use `import` syntax natively.
- ESLint uses flat config (`eslint.config.js`) with `typescript-eslint`.
- Prettier is the single formatter. Generated and build artifacts are excluded via
  `.prettierignore` — `pnpm-lock.yaml`, `dist/`, `.next/`, `coverage/` — so formatting
  checks stay meaningful and never rewrite machine-owned files.

## Consequences

- No runtime warnings from the linter; config is unambiguously ESM.
- `pnpm format` and the `prettier --check` CI gate operate only on authored source.
- Packages that need CommonJS output opt in locally through their own build settings
  rather than changing the root default.
