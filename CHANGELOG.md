# Changelog

All notable changes to Site Rescue are recorded here. The project follows Semantic Versioning after its first public release.

## Unreleased

## 0.2.0-rc.1 — candidate, not published

This section describes an unreleased review candidate; no tag or GitHub Release exists for it. Workspace, CLI and generated package versions agree. Site, Snapshot, evidence, Report and bundle format versions remain independent and unchanged by this preparation.

### Candidate preparation

- Include a synthetic UTF-8 HTML example, expected results, input support matrix and offline walkthrough in the checksummed standalone package. Reject linked example entries during packaging.
- Add actual relocated-package end-to-end CI: import the included example, inspect Report2, serve home/anchor/attachment over loopback, stop preview, move the working source, replay offline and verify original-file hashes and both bundles.
- Fix actual CLI startup through directory aliases (including macOS temporary paths): compare canonical entry-file paths so invocation runs rather than silently returning. A packaged alias regression reproduces the failure; source symlink protections are unchanged.
- Preserve Apache-2.0 and bundled dependency notices. This candidate needs Node >=24.22.0 <25 and does not add ZIP source input, official Weebly format certification, Live Snapshot or a GUI.

### Fixed

- SR-001: a truncated crawl now records an actionable warning and forces migration review; capture/rescue explicitly report incomplete acquisition.
- Dependency security maintenance: update Vitest/mocker to 4.1.11, js-yaml to 4.3.2, undici to 7.29.1, brace-expansion to 1.1.21/5.0.12 and source-map-js to 1.2.2; remove old tinypool through Vitest 4. Full branch audit changed from 22 entries to zero known advisories.

### Added

- SR-008: `wizard` terminal command for generic HTML folders: read-only in-memory analysis, explicit IMPORT consent, unchanged-source/fresh-destination rechecks, existing offline import, real bundle verification, readable review evidence and independently chosen loopback preview. Cancellation creates no rescue output; non-TTY use points to existing scripting commands. ADR-029 and an actual packaged terminal/preview smoke cover the focused scope.

- SR-006: stable exact-query page output paths, output-only URL mapping 1.0.0, query redirect handoff 2.0.0, local link/fragment aliases and query-only static entry pages. Uncaptured query references retain source URLs with CLI warnings; non-query paths and redirect manifest 1.0.0 remain compatible. Proposed ADR-027 and a network-guarded bundled CLI smoke cover this unreleased scope.

- SR-005: Report 2.0.0 separates observed acquisition, conversion limitations, actual static reference checks and unassessed manual deployment review. Structured acquisition evidence is checksum-bound to its Site; stale evidence fails explicitly. No source coverage/accuracy percentage is inferred.
- `report --site-directory` performs explicit generated static verification; workflow reports carry the actual result. Prototype-like and future warning codes remain visible and counted safely. Byte-exact legacy Report 1.0.0 bundle validation remains supported.

- SR-004 generic offline portion: explicit Source Snapshot 1.0.0 original-file/hash/acquisition-time index and `replay-source`, verifying the exact raw file set before re-normalizing with the current generic adapter. Replay works without the original folder or old Site JSON, preserves source evidence and always requires review. Legacy evidence needs explicit re-import; live capture snapshots remain deferred.
- Proposed ADR-025 and network-guarded actual bundled Snapshot/replay CI smoke.

- SR-002: semantic inline links, strong/emphasis, literal code, line breaks and anchors for paragraphs, headings and list items in both adapters and static export.
- SR-003: `inspect-source` for bounded read-only HTML directory file/hash/reference inventory, missing-file evidence and explicit review warnings.
- SR-003 generic HTML folder follow-up: `import-source` acquires original byte/hash evidence, maps local pages/assets/attachments, and runs offline normalization, export, report, static verification and bundle manifest. Real samples are not a prerequisite for this generic contract; ZIP and official Weebly format support remain excluded.
- Proposed ADR-024 documents offline acquisition, synthetic URL provenance, compatibility and remaining limits. CI exercises the real bundled import with network guards.
- Consolidated development handoff, progress tracking and Proposed ADR-020 through ADR-023.
- `pnpm audit:dependencies` and a CI dependency audit that fails on known low-or-higher advisories or registry errors.

### Changed

- Required 2026-10-24 security prerequisite: Vitest/mocker4.1.12, Vite7.3.7, Undici7.30.1 and Zod4.6.7 across its three direct users clear 11 newly reported npm advisories. Zod major upgrade retains schema expressions and requires clean legacy/data-contract validation; that prerequisite did not change saved data or package versions. See the 2026-10-24 integration review.

- SR-007: unreleased development/new package requirements are now Node >=24.22.0 <25, with pinned Node24.22.0 and unchanged pnpm10.34.5. Bundle target derives from the runtime pin; mismatching metadata rejects. Full Ubuntu24.04/Windows2025/macOS15 CI and a stable aggregate Quality checks gate replace Ubuntu-only Node20 CI. Actions use verified Node24 commit pins. The published v0.1.0 archive is unchanged; see Proposed ADR-028.
- Release staging rename retries only temporary EPERM/EBUSY failures three times before failing; other errors remain immediate failures. Regression tests cover recovery, bounded failure and staging cleanup.
- Canonicalize fresh capture roots before creating offline evidence, supporting macOS temporary-directory aliases and Windows runner short paths while retaining strict source/descendant symlink and junction rejection.

- New Report 2.0.0 always remains review-required while original site completeness and manual review are unproven; `checksumRecordedLocalAssetCount` replaces the old misleading verified count. This changes the report contract, not Site/Snapshot/bundle versions or the published package.

- New captures use Site schema 1.1.0; updated readers retain compatibility with saved 1.0.0 captures and matching bundle manifests. Older readers reject 1.1.0. Candidate package version 0.2.0-rc.1 does not change those saved-data contracts.

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
