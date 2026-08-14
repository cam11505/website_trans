# ADR-004: Normalize content into a versioned schema

- Status: Accepted
- Date: 2026-08-14

## Context

Source platforms encode equivalent content with different DOM structures. Exporters should not need to understand those structures.

## Decision

Define a runtime-validated, serializable `Site` schema with a required `schemaVersion`. Pages contain semantic content blocks and preserve unsupported markup only through an explicit `rawHtml` escape hatch. The initial version is `1.0.0`.

## Consequences

- Adapters and exporters share one contract.
- Stored migrations can be checked before use.
- Breaking schema changes require a version change and, when needed, a migration path.

