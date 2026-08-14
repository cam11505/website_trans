# ADR-008: Use fixture-driven, offline-first tests

- Status: Accepted
- Date: 2026-08-14

## Context

Live Weebly pages can change or disappear, and tests must not depend on third-party availability or crawl real sites unexpectedly.

## Decision

Keep small, representative, sanitized HTML fixtures in the repository. Unit and integration tests use injected fetchers or local servers. Optional live-site checks are separate, explicit, and never part of the default test suite.

## Consequences

- Default tests are deterministic and safe to run offline.
- Fixtures need ongoing coverage as new markup variants are found.
- Live compatibility still needs explicit validation before releases.

