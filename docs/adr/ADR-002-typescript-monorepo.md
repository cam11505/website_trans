# ADR-002: Use a TypeScript pnpm monorepo

- Status: Accepted
- Date: 2026-08-14

## Context

The CLI, crawler, adapters, schema, and later exporters have distinct ownership boundaries but must evolve together during early development.

## Decision

Use strict TypeScript, ECMAScript modules, pnpm workspaces, and TypeScript project references. Applications live under `apps/`; reusable capabilities live under `packages/`. Each workspace publishes an explicit package boundary and builds to `dist/`.

## Consequences

- Cross-package dependencies are visible and type-checked.
- One install and one set of root commands validate the repository.
- Node.js 20 or newer and pnpm are required for development.

