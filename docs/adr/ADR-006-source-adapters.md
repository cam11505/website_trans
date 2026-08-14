# ADR-006: Isolate source platforms behind adapters

- Status: Accepted
- Date: 2026-08-14

## Context

Detection signals and DOM interpretation vary by platform and change over time.

## Decision

A source adapter owns platform identity, detection evidence, confidence, and later page normalization. Detection accepts a fetched document so diagnosis does not require platform-specific network behavior. The first implementation detects Weebly through host and document signatures.

## Consequences

- Weebly heuristics can evolve independently.
- Detection exposes evidence rather than a hard-to-debug boolean.
- Generic HTML and future platform adapters can be added without changing crawler behavior.

