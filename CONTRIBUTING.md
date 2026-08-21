# Contributing to Site Rescue

Thank you for helping improve Site Rescue.

## Development setup

- Use Node.js 20.19 or newer and the pnpm version recorded in `package.json`.
- Install dependencies with `pnpm install --frozen-lockfile`.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before opening a pull request.
- Run `pnpm release:check` when changing CLI entry points, package metadata, release tools, or release documentation.

## Change boundaries

- Keep platform-specific parsing inside a source adapter.
- Keep crawler, normalized schema, asset pipeline, reports, and exporters platform-neutral.
- Add deterministic fixtures and offline tests for behavior changes.
- Do not add live-site access to the default test suite.
- Preserve local-first operation and conservative safety limits.

## Pull requests

- Keep each pull request focused on one phase or capability.
- Explain user-visible behavior, architectural decisions, limitations, and verification performed.
- Update an ADR when a change alters a previously accepted architectural boundary.
- Do not include private website content, credentials, tokens, or customer data in fixtures or logs.

By contributing, you confirm that you have the right to submit the contribution under the repository's selected license once it is added.
