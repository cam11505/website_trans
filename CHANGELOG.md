# Changelog

All notable changes to Site Rescue are recorded here. The project follows Semantic Versioning after its first public release.

## Unreleased

### Fixed

- SR-001: a truncated crawl now records an actionable warning and forces migration review; capture/rescue explicitly report incomplete acquisition.

### Added

- SR-002: semantic inline links, strong/emphasis, literal code, line breaks and anchors for paragraphs, headings and list items in both adapters and static export.
- SR-003 Inventory phase: `inspect-source` for bounded read-only HTML directory file/hash/reference inventory, missing-file evidence and explicit review warnings. ZIP extraction and full offline import are not included.
- Consolidated development handoff, progress tracking and Proposed ADR-020 through ADR-023.

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
