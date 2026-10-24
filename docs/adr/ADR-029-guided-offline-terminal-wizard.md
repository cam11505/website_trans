# ADR-029: Guided offline HTML-folder terminal workflow

- Status: Proposed — implemented for review in SR-008 Stage B
- Date: 2026-10-24
- Base: unchanged #35 documentation on #34 runtime candidate

## Decision

Add `site-rescue wizard` as a thin terminal flow in apps/cli, reusing inspectHtmlDirectory, import-source, verify-bundle and preview. No new framework, package, source format, GUI or data schema. Generic UTF-8 HTML folders only; live URLs, ZIP, Snapshot replay selection and official-format validation remain direct/future scopes. Existing direct commands stay available for automation and advanced limits/styles.

Flow: enter source and new separate output paths → bounded read-only in-memory Inventory → show HTML/file/reference counts and bounded missing/unsafe/unsupported summaries → disclose destination and planned capture/site/report/manifest writes → require explicit `IMPORT` → revalidate destination and unchanged analysis → existing import pipeline → report real static and bundle verification separately → show report/site paths and a shell-quoted preview command → start existing loopback preview only for a separate yes choice.

No inspect-source command is called for analysis because that command writes files. Empty path, EOF, Ctrl+C or any non-IMPORT execution choice cancels before rescue output creation. No `--yes` flag or input-pipe consent bypass is introduced. Both stdin and stdout must be TTY; ordinary noninteractive execution fails immediately with direct import-source guidance. Wizard accepts no command-specific flags; normal global help/version remain available. Paths may contain spaces/Traditional Chinese and optionally balanced surrounding quotes. Source-derived terminal text neutralizes control characters; summaries are bounded and reports retain evidence.

Analyze with current Inventory defaults. Re-read Inventory after confirmation and reject changes instead of silently importing a stale analysis; the importer still performs its own bounded source/stat/hash checks. This is not an atomic snapshot against hostile concurrent writers; tell users to stop source writers. Existing overlap/ancestor/alias checks and fresh-output rejection run before analysis and again before execution. No directories are created by cancellation. Once execution is chosen, existing core cleanup/retained-static-failure behavior applies.

## Evidence and exits

- 0: cancellation or supported static workflow completed. Completion still requires manual review; it does not mean source completeness or visual/functional equivalence.
- 1: invalid input/options, non-TTY, stale analysis, unsafe paths, fatal import/preview error.
- 2: generated static integrity failure, or actual post-import bundle verification failure. Retain generated evidence, avoid preview, and never label a missing/unverified manifest valid.

Show normalized page counts, conversion warning count, actual static checked-reference/issue counts, actual verify-bundle file/issue counts, and manual review/unknown source completeness as separate facts. A written manifest is not reported as a completed bundle verification: call the verifier before claiming it. Invalid static output keeps its report and omits a valid-manifest claim.

Preview uses the existing verifier and127.0.0.1 server; it never opens a browser, configures hosting or executes source scripts in the CLI. Ctrl+C stops preview normally. Interface English; README includes Traditional Chinese instructions.

## Prerequisite and compatibility

Stage A review found newly published advisories blocking #35 CI; see [review](../reviews/2026-10-24-integration-review.md). Update only the required dependency versions, including the deliberate Zod4 migration, retaining schema expressions and validating legacy captures/reports/bundles with clean rebuilt declarations. Do not suppress the audit or claim old v3 code is fixed by importing a compatibility path. No package/data version bump, main merge, tag or publication is part of this stage.

The Draft PR includes unchanged #30–#35 dependencies. Stage C release preparation is separate and needs its own exact-commit verification and authorization.

## Validation

Two CLI regressions failed before implementation (missing help entry and missing useful non-TTY guidance). Cover in-memory analysis, all cancellation points, explicit consent, existing/overlap/alias protections, Chinese/spaced paths, stale source, static failure, unsupported content, inert warning output and independent preview choice with offline fixtures. Exercise the actual bundled terminal adapter using a test-only TTY shim over child-process pipes: ordinary pipes must still reject. Deny outbound fetch/sockets, allow only loopback listening, and gracefully stop actual preview. Keep all five older bundled smokes, add the wizard smoke to all three CI platforms, and verify exact-head CodeQL independently.
