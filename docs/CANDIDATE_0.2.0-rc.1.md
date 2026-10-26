# 0.2.0-rc.1 candidate acceptance record

Prepared: 2026-10-26. **Unreleased; no merge/tag/publication authorization.**

- Base: Draft PR #36, `0a58e64fa91edd8ac3fb5cb8b5beca6b9969e26a`, retaining #30–#35.
- Candidate branch: `codex/stage-c-0.2.0-candidate`. The Draft PR records the final commit, exact-head checks and any platform skips. Do not substitute base CI results.
- Node24.22.0, engines >=24.22.0 <25, pnpm10.34.5, TypeScript/pnpm and Apache-2.0 remain unchanged.
- All 23 workspace versions, CLI version and generated package metadata use 0.2.0-rc.1; all packages stay private. Saved-data versions remain unchanged; see [input/compatibility matrix](./INPUT_SUPPORT.md).

## Evidence prepared

Two release-tool regressions failed before implementation: missing packaged example/walkthrough and failure to reject a linked example directory. Both pass after the focused copy/validation change. The suite now has 17 release-tool tests.

The initial head8f7297d passed local checks and Linux, but macOS relocated-package execution returned an empty version because the CLI compared lexical entry-file paths across `/var` and `/private/var`. An added directory-alias smoke reproduced this on Windows before repair. Only CLI dispatch now compares canonical entry-file paths; source-link rejection is unchanged. Initial head/archive results are superseded; the Draft PR and final local artifact record identify the repaired SHA and its actual validation.

The package contains 17 checksummed files plus its checksum inventory, with 29 runtime dependency license/NOTICE records. The seventh packaged smoke relocates the package outside the repository, uses its included example and checks actual import/report/loopback preview/graceful stop/moved-source offline replay/original hashes/both bundles. Existing six smokes and legacy Site/Report compatibility remain required.

Local Windows x64 verification completed on Node24.22.0/pnpm10.34.5: frozen offline install, lint, typecheck, test (38 files, 264 passed/6 platform-specific skipped, 270 total), build, release check and all seven packaged smokes passed. Fresh dependency audit reported zero known advisories. The modified/new documentation passed 85 relative-link checks; all 23 workspace manifests agree on the private candidate version. Remote results must still be verified on the final candidate SHA.

Manual Windows x64 walkthrough used only a fresh working copy of the packaged synthetic example:

1. Read the two HTML pages, local stylesheet, SVG and text attachment; record all five original SHA-256 values.
2. Actual bundled import with source styles: 2 pages, 3 assets; read generated Markdown/JSON Report2. Acquisition observed-scope-complete, original completeness unknown, conversion review-required, static valid and manual review not-assessed.
3. Actual loopback preview in a browser: readable Chinese home/logo/style, inline guide link to `#steps`, ordered list, back navigation and attachment content. Stop preview and confirm listener closed.
4. Validate move endpoints within this new test workspace, move only the example working copy, then replay its saved Snapshot without the original path.
5. Verify both 22-file bundles and all five original hashes in moved source/import evidence/replay evidence. No original example or customer source was changed.

Local logs and archive/checksum are review artifacts outside Git; their final SHA-bound record is linked in the Draft PR. Automated CI does not substitute for this limited browser inspection. Release ZIP extraction is checked on Windows only; each CI platform checks the relocated package folder.

## Remaining decisions and limits

This candidate is ready for review only after its own local and remote checks pass. PR consolidation/merge and any tag/release are separate explicit decisions. Main and the published v0.1.0 remain unchanged during preparation. A release from a later main commit needs new exact-commit verification.

Generic UTF-8 HTML folders are the tested input. No ZIP source importer, official Weebly format certification, Live URL Snapshot, GUI, native installer or proof of full visual/functional parity is provided. Static integrity and SHA-256 are not website-completeness guarantees. See [walkthrough](./OFFLINE_WALKTHROUGH.md), [expected results](../examples/offline-starter/EXPECTED.md) and [ADR-030](./adr/ADR-030-unreleased-candidate-package.md).
