# Changelog

All notable changes to Site Rescue are recorded here. The project follows Semantic Versioning after its first public release.

## Unreleased

### Fixed

- SR-001: a truncated crawl now records an actionable warning and forces migration review; capture/rescue explicitly report incomplete acquisition.
- Dependency security maintenance: update Vitest/mocker to 4.1.11, js-yaml to 4.3.2, undici to 7.29.1, brace-expansion to 1.1.21/5.0.12 and source-map-js to 1.2.2; remove old tinypool through Vitest 4. Full branch audit changed from 22 entries to zero known advisories.

### Added

- SR-002: semantic inline links, strong/emphasis, literal code, line breaks and anchors for paragraphs, headings and list items in both adapters and static export.
- SR-003: `inspect-source` for bounded read-only HTML directory file/hash/reference inventory, missing-file evidence and explicit review warnings.
- SR-003 generic HTML folder follow-up: `import-source` acquires original byte/hash evidence, maps local pages/assets/attachments, and runs offline normalization, export, report, static verification and bundle manifest. Real samples are not a prerequisite for this generic contract; ZIP and official Weebly format support remain excluded.
- Proposed ADR-024 documents offline acquisition, synthetic URL provenance, compatibility and remaining limits. CI exercises the real bundled import with network guards.
- Consolidated development handoff, progress tracking and Proposed ADR-020 through ADR-023.
- `pnpm audit:dependencies` and a CI dependency audit that fails on known low-or-higher advisories or registry errors.

### Changed

- New captures use Site schema 1.1.0; updated readers retain compatibility with saved 1.0.0 captures and matching bundle manifests. Older readers reject 1.1.0. Package/release versions remain unchanged for this unpublished integration.

## 0.1.0 - 2026-08-22

### Added

- Platform-neutral normalized site schema and source-adapter registry
- Weebly and Generic HTML source adapters
- Bounded same-origin crawling with reliable HTTP policies
- Local asset and recursive CSS dependency rescue
- Static HTML export, redirect handoff, migration reports, offline verification, and local preview
- Deterministic whole-bundle integrity manifests
- Fresh-output-only protection for output-producing commands
- Self-contained CLI release-package preparation and verification
- Apache-2.0 project licensing and SPDX package metadata
- Generated third-party runtime license and NOTICE inventory for release packages
- Guarded public issue forms, pull request checklist, and repository-publication controls
- Public GitHub repository with protected `main`, secret scanning, push protection, dependency alerts, CodeQL, and private vulnerability reporting
