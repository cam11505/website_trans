# ADR-030 — Unreleased candidate package and public offline walkthrough

Status: Proposed (Stage C candidate preparation, 2026-10-26)

## Context

Draft PR #36 at `0a58e64fa91edd8ac3fb5cb8b5beca6b9969e26a` combines #30–#35 and the SR-008 terminal wizard. Its exact-head CI and CodeQL passed. Main remains `d8834de`; v0.1.0 remains the only published release. The next authorized scope is Stage C preparation, not merge or publication.

## Decision

- Prepare one focused candidate commit on `codex/stage-c-0.2.0-candidate`, based on unchanged #36, and propose a main-base Draft PR. Preserve the dependency history for review.
- Use `0.2.0-rc.1` consistently for all workspace manifests, actual CLI version and generated package metadata. Keep packages private. Candidate metadata does not create a tag or release.
- Preserve independent saved-data contracts: Site1.0/1.1, Source Snapshot1, acquisition evidence1, frozen Report1 reads/new Report2, bundle1 and existing URL mapping/redirect formats.
- Ship a synthetic Apache-2.0 UTF-8 folder, expected outcomes, support matrix and short walkthrough inside the standalone checksummed package. No customer data, active source scripts or remote example dependencies.
- Extend the release builder's existing regular-file checks to the example and required documents. Reject linked example entries; copy only regular source files. No archive extraction or runtime dependencies are added.
- Run a seventh real packaged smoke on all three existing CI platforms: relocate the package, verify inventory/licenses/version, import the shipped example, inspect Report2, preview over loopback, stop gracefully, move only the test-owned source, replay from Snapshot and verify both bundles and original hashes. Network guards and ephemeral-port/TTY transports remain test-only.
- Separately record a manual browser walkthrough and local ZIP/checksum/extraction checks bound to the candidate SHA. A local packaging ZIP does not implement ZIP source input. Platform CI relocates the folder; it does not certify native installers or every archive extractor.

## Consequences and acceptance

Regression tests must fail before the packaging change, then pass. Full lint/typecheck/test/build/release check and audit must run; exact-head platform results and CodeQL are recorded in the Draft PR, not inferred from #36. Keep the aggregate `Quality checks` gate.

Report2 remains review-required even when static references and hashes pass. Original-site completeness, visual/functional parity, official Weebly formats, ZIP source input, Live Snapshot and GUI remain outside this preparation. Local source originals remain unchanged.

Merge, superseded-PR closure, tag and publication each retain their existing authorization boundaries. A later release must use its own reviewed main commit and release checklist; the old #29 merge approval does not apply.
