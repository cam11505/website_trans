# ADR-007: Keep exporters independent from source adapters

- Status: Accepted
- Date: 2026-08-14

## Context

A rescued site may eventually target plain static HTML, Astro, or another output without being crawled again.

## Decision

Future exporters consume only the normalized schema and local assets. They must not inspect Weebly DOM or call source adapters. No exporter is implemented in phase one; the boundary is documented now to prevent coupling.

## Consequences

- One normalized capture can feed multiple targets.
- Fidelity depends on the normalized model, not hidden source-specific shortcuts.
- Export format selection remains outside the current milestone.

