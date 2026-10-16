# Architecture Decision Records

ADRs record decisions that shape Site Rescue. Accepted decisions are changed by a new superseding ADR, not by silently rewriting history.

| ADR | Decision | Status |
| --- | --- | --- |
| [ADR-001](./ADR-001-platform-neutral-core.md) | Platform-neutral core | Accepted |
| [ADR-002](./ADR-002-typescript-monorepo.md) | TypeScript pnpm monorepo | Accepted |
| [ADR-003](./ADR-003-cli-first-local-first.md) | CLI-first and local-first | Accepted |
| [ADR-004](./ADR-004-versioned-content-schema.md) | Versioned normalized content schema | Accepted |
| [ADR-005](./ADR-005-conservative-crawling.md) | Conservative same-origin crawler | Accepted |
| [ADR-006](./ADR-006-source-adapters.md) | Source adapter boundary | Accepted |
| [ADR-007](./ADR-007-exporter-boundary.md) | Exporter boundary | Accepted |
| [ADR-008](./ADR-008-fixture-driven-testing.md) | Fixture-driven testing | Accepted |
| [ADR-009](./ADR-009-source-adapter-registry.md) | Core source-adapter registry | Accepted |
| [ADR-010](./ADR-010-generic-html-fallback-adapter.md) | Generic HTML fallback adapter | Accepted |
| [ADR-011](./ADR-011-loopback-local-preview.md) | Loopback-only local preview server | Accepted |
| [ADR-012](./ADR-012-css-dependency-rescue.md) | Recursive CSS dependency rescue | Accepted |
| [ADR-013](./ADR-013-opt-in-source-styles.md) | Opt-in source stylesheet application | Accepted |
| [ADR-014](./ADR-014-redirect-preservation-and-handoff.md) | Redirect preservation and deployment handoff | Accepted |
| [ADR-015](./ADR-015-deterministic-rescue-bundle-integrity.md) | Deterministic rescue bundle integrity | Accepted |
| [ADR-016](./ADR-016-reliable-http-and-safe-output.md) | Bounded HTTP reliability and fresh-output-only writes | Accepted |
| [ADR-017](./ADR-017-self-contained-release-package.md) | Self-contained CLI release package | Accepted |
| [ADR-018](./ADR-018-apache-2.0-license.md) | Apache-2.0 project license and bundled dependency notices | Accepted |
| [ADR-019](./ADR-019-public-repository-governance.md) | Guarded public repository controls | Accepted |
| [ADR-020](./ADR-020-source-acquisition-and-offline-import.md) | Source acquisition, immutable snapshots, and offline import | Proposed |
| [ADR-021](./ADR-021-rich-content-and-migration-coverage.md) | Rich inline content and migration coverage semantics | Proposed |
| [ADR-022](./ADR-022-versioned-inline-content.md) | Versioned inline content with legacy capture reads | Proposed (SR-002 draft implementation) |
| [ADR-023](./ADR-023-read-only-html-directory-inventory.md) | Read-only HTML directory inventory before offline import | Proposed (SR-003 inventory draft implementation) |
| [ADR-024](./ADR-024-generic-offline-html-import.md) | Generic offline HTML folder acquisition, provenance and import | Proposed (SR-003 follow-up implementation) |
| [ADR-025](./ADR-025-generic-source-snapshot-replay.md) | Generic source snapshot contract and offline current-adapter replay | Proposed (SR-004 generic offline implementation) |
| [ADR-026](./ADR-026-evidence-based-migration-report.md) | Versioned acquisition/conversion/static/manual-review evidence | Proposed (SR-005 implementation) |
| [ADR-027](./ADR-027-exact-query-url-mapping.md) | Stable exact-query static paths and redirect handoff | Proposed (SR-006 implementation) |

The integration branch includes the handoff and these proposals. ADR-020/021 originated in [Draft PR #23](https://github.com/cam11505/website_trans/pull/23); implementation of a narrower scope does not automatically accept a broader proposal. See [integration progress](../INTEGRATION_PROGRESS.md).
