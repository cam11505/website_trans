# ADR-001: Keep the core platform-neutral

- Status: Accepted
- Date: 2026-08-14

## Context

Weebly is the first rescue target, but the toolkit must support other hosted site builders later. Coupling crawling or exported output directly to Weebly would make every future source a rewrite.

## Decision

Use a pipeline of source adapter -> normalized site model -> exporter. Only a source adapter may contain platform-specific detection and parsing rules. The crawler, content schema, CLI orchestration, storage, and future exporters remain platform-neutral.

## Consequences

- New platforms implement an adapter rather than forking the application.
- Platform-specific behavior must not leak into shared packages.
- Some abstractions are introduced before a second adapter exists, so fixtures and contracts must keep them honest.

