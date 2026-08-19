# ADR-009: Select source platforms through a core adapter registry

- Status: Accepted
- Date: 2026-08-19

## Context

ADR-006 established a source-adapter boundary, but the CLI still imported Weebly-specific detection and normalization functions. Adding another platform would therefore require editing the diagnosis and capture orchestration code.

## Decision

The platform-neutral `core` package owns the complete source-adapter contract and deterministic adapter selection. Each adapter supplies its identity, display name, detection result, and normalization implementation. The CLI receives a registry of adapters, selects the detected adapter with the highest confidence, and delegates normalization through that contract.

Adapter IDs must be unique. Detection confidence must be between zero and one, and a detection result must identify the adapter that produced it. Equal-confidence matches preserve registry order so selection remains deterministic.

Phase 9 registers only the Weebly adapter by default. Tests inject a fixture adapter to prove that diagnosis and capture no longer depend on Weebly-specific functions.

## Consequences

- New source platforms can be added without changing crawler, schema, exporter, report, or verification packages.
- CLI orchestration depends on the core contract rather than a platform implementation.
- Invalid or duplicate adapters fail early with actionable errors.
- A future adapter still requires its own detection, normalization, fixtures, and review before being enabled by default.
