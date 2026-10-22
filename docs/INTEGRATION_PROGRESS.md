# Site Rescue — historical integration evidence

> **Current status, updated 2026-10-22:** use [PROJECT_STATUS.md](./PROJECT_STATUS.md), [CODEX_HANDOFF.md](./CODEX_HANDOFF.md) and [NEXT_STEPS.md](./NEXT_STEPS.md). The stage notes below are chronological historical snapshots, not current instructions. PR #29 is merged. The complete candidate is Draft #34 at de0b991, including #30–#33; its repaired three-platform CI/CodeQL passed. Published v0.1.0 is unchanged. Statements below such as “next,” “not started,” “pending,” or “main unchanged” apply only to their original stage.

## Superseding verification record

The repaired SR-007 head de0b991d3bc6b332561d2cbcf17ae44a7c377c70 passed [CI 38920677453](https://github.com/cam11505/website_trans/actions/runs/38920677453) and [CodeQL 38920672288](https://github.com/cam11505/website_trans/actions/runs/38920672288). Ubuntu: 244 passed/0 skipped; Windows: 238/6; macOS: 242/2, all 37 files and all five bundled smokes. These results resolve the initial matrix failure described below. They do not certify later documentation or feature commits.


## Current SR-007 runtime/platform follow-up

PR #33 remains Draft at `7531edd` with CI/CodeQL green; main is `d8834de`. This branch retains unchanged #30–#33 dependencies. New source/generated packages require Node >=24.22.0 <25, with Node24.22.0 pinned and pnpm10.34.5 unchanged. Release tools derive their target from the pin and reject engine drift; actual Windows full-suite EPERM staging failures led to regression-first bounded rename retries. Three-platform CI runs every quality/release check and five bundled offline smokes on Ubuntu24.04, Windows2025 and macOS15, with the existing aggregate Quality checks gate retained. ADR-028 records official version/action references and compatibility limits. No main merge, tag or release; published v0.1.0 metadata/assets are unchanged.

Local Windows x64 / verified portable Node24.22.0: frozen install, lint, typecheck, test, build, release check and audit passed. Tests: 37 files / 238 passed / 6 platform-specific skips / 244 total. All five actual bundled network-guarded CLI smokes passed; release check verified 8 files / 29 runtime packages. Before fixes, six runtime-contract regressions and three staging-retry regressions failed; immediate non-retryable error rejection already passed. The first real matrix also exposed OS path aliases in generated evidence reads: a regression reproduced this locally before canonicalizing only the fresh capture root, retaining source/descendant symlink rejection. Linux passed but Windows/macOS and the aggregate gate correctly failed on that initial head. Exact repaired-head three-platform CI/CodeQL results belong to the new PR and must not be inferred from local results. SR-008, official ZIP and Live Snapshot acquisition remain separate.

## Current SR-006 exact-query follow-up

PR #32 remains Draft at `980178a` with exact-head CI/CodeQL green; main is `d8834de`. This follow-up includes unchanged #30/#31/#32 dependencies and implements stable SHA-256 target-path/query files, output-only URL mapping 1.0.0, exact-query redirect handoff 2.0.0, direct local aliases/fragments and a query-only entry fallback. Plain paths and non-query redirect manifest 1.0.0 remain compatible. Unknown query variants retain source URLs with warnings; no query service or missing content is invented. Regression tests preceded implementation; both adapters and actual bundled export/report/verify/manifest run offline. See ADR-027 and the follow-up PR for actual validation counts. No merge/tag/release is authorized. SR-007 runtime/platform CI is next; generic folder file-only query handling, ZIP and Live Snapshot limits remain unchanged.

Local Windows / Node 24.19.0 validation: frozen-lockfile install, lint, typecheck, build and release check passed; 37 test files / 226 passed / 6 Linux-only skipped (232 total). All five actual bundled CLI smokes passed with fetch/socket guards. Audit found no known vulnerabilities; release package checked eight files and 29 runtime packages. Initial query regression had nine failures before implementation; focused relative-button and unknown-relative-query cases also failed before their fixes. Linux-only cases and exact-head CI/CodeQL must be verified on the new PR, not inferred from local results.

## Current SR-005 coverage follow-up

PR #31 remains Draft at `de46313` with exact-head CI/CodeQL green; main is still `d8834de`. The user requested the next step. Report 2.0.0 now separates acquisition/conversion/static/manual-review evidence, records unknown original source completeness, uses actual verifier results and keeps all new reports review-required. New capture evidence binds direct crawler/Inventory counts to the validated Site. Legacy reports/bundles retain byte-exact frozen validation; Site/Snapshot/bundle versions are unchanged. See ADR-026. This branch includes unchanged #30/#31 dependencies for full main-base CI/CodeQL, without merging or publishing. Query routing, runtime, guided UX, ZIP and Live Snapshot acquisition remain separate. Actual stage validation belongs to its PR.

## 2026-10-16 generic Snapshot/replay follow-up

PR #30 remains Draft at `0603063`, with its 181-test Linux CI and CodeQL passing. The user requested the next step. This follow-up implements the generic offline part of SR-004: Source Snapshot 1.0.0 original file/hash/acquisition-time metadata, exact raw-source integrity pinning and `replay-source` through the current generic adapter and existing downstream pipeline. It does not read the previous normalized Site, need the original folder, alter old evidence or trust legacy output-only JSON as a replay contract. New output remains review-required. See ADR-025 for compatibility/resource/security limits. Live capture snapshots, ZIP and SR-005 onward remain separate; main and release are unchanged. Fresh validation belongs to the follow-up PR.

## Current checkpoint after PR #29

PR #29 was approved and squash-merged as main `d8834de7dacedb020b4b96e907e23e1f93b1e3b8`. [Main CI](https://github.com/cam11505/website_trans/actions/runs/38589246860) passed 32 files / 162 tests; [main CodeQL](https://github.com/cam11505/website_trans/actions/runs/38589247148) passed. Issue #24 closed and all five default-branch dependency alerts were automatically fixed. No version/tag/release was created; v0.1.0 remains the published artifact.

The user then authorized continuing generic HTML folder import without a real-sample prerequisite. The focused follow-up implements `import-source`, using the existing generic adapter and downstream pipeline, with original byte evidence, hashes, explicit synthetic URL provenance and actionable warnings. Generic folder import is tested with synthetic fixtures; official Weebly archive layouts and ZIP extraction are not claimed. See [ADR-024](./adr/ADR-024-generic-offline-html-import.md) and README commands. SR-003 now includes the generic offline pipeline; archive-specific support remains future scope. SR-004 parser replay and later roadmap features are not started by this change. Exact follow-up validation belongs to its PR, not the historical counts below.

## Historical preparation of PR #29

This record describes the **unreleased integration in [PR #29](https://github.com/cam11505/website_trans/pull/29)**, prepared on `codex/security-dependency-alerts` and retargeted directly to main. Its history includes the original integration PR #28, documentation from PR #23 and implementations from PR #25, #26 and #27, plus dependency security maintenance. Its baseline is main `37798cb3aa71170c0ad60b513a6ae6863da6df67`. The original PRs remain available for focused review and regression evidence; they do not have to be merged first to review this complete candidate. Current merge/check status belongs to the live PR page. This preparation does not automatically merge, bump versions, tag or release; the published bundle remains v0.1.0.

PR #29 originally used PR #28's integration branch as its base. It now targets main so the whole candidate, including security fixes, can receive fresh CI and CodeQL checks. Its branch audit reduced 22 entries to zero; default main/release alert status is separate. See [exact versions and validation](./SECURITY_MAINTENANCE_20261014.md). Roadmap item counts below are unchanged.

## Progress against the handoff

| Roadmap item | Implemented here | Remaining scope |
| --- | --- | --- |
| SR-001: truthful truncated-crawl readiness | Complete for the acceptance cases: structured crawl-truncated warning, incomplete capture/rescue messages, report review-required | Human review/merge; previous captures need recapture if truncation was not recorded |
| SR-002: inline links and formatting | Complete for paragraphs/headings/lists and specified semantic inline nodes, both adapters, local/fragment rewriting and legacy capture reads | Arbitrary DOM/layout, richer media, full source CSS/visual parity |
| SR-003: offline acquisition/import | Inventory phase complete: bounded read-only generic HTML folder, hashes, common references, missing files and warnings | Authorized sanitized official sample, verified formats, ZIP extraction security and complete offline import/export/report/verify |
| SR-004: source snapshot/replay | Not started | Immutable raw HTML/assets, provenance, integrity and offline replay |
| SR-005: source coverage/loss reporting | Not started as a separate model | Distinct acquisition, conversion, integrity and manual-review evidence |
| SR-006: query-based URL mapping | Not started | Stable output mappings and collision/redirect/link tests |
| SR-007: runtime/CI matrix | Not started | Supported runtime policy, formal Node baseline and platform matrix |
| SR-008: guided UX | Not started | User flow built on reliable CLI core |

繁體中文進度：八項 Roadmap 中，**兩項完成實作、一項部分完成、五項尚未開始**。這是項目狀態，不代表各項工作量相等；完整離線救援目標仍未完成。本記錄準備時新增程式仍在 review branch，後續合併狀態以 GitHub 為準，不能把功能實作視為已正式發版。

## Try the integrated source

```bash
git clone https://github.com/cam11505/website_trans.git
cd website_trans
git fetch origin pull/29/head
git switch --create codex/review-pr29 FETCH_HEAD
pnpm install --frozen-lockfile
pnpm build
node apps/cli/dist/index.js --help
node apps/cli/dist/index.js inspect-source ./fixtures/shared/html-directory --output ./inventory-review
```

The PR ref selects this integration even after the feature branch is deleted by the repository's merge policy. The fixture is synthetic and deliberately contains missing references, an external link, a query and inert source script. The inventory must require review and state that migration is not assessed. Exit 0 means an inventory was written; it does not mean migration ready. Use a new output directory on every run, separate from source inputs.

New captures use Site schema **1.1.0**. This source reads both 1.0.0 and 1.1.0, retaining the input version. Older v0.1.0 readers reject 1.1.0. Package versions stay 0.1.0 for this unpublished integration; inventory, report and bundle output contracts remain distinct. See ADR-022 and ADR-023 for exact compatibility and limits.

## Validation evidence and integration gates

Original stages wrote regression tests before implementation. SR-001 initially failed four acceptance cases; SR-002 initially failed four preservation/warning cases; SR-003 initially failed seventeen command/safety cases. These were subsequently fixed. All stage tests remain present in the integrated tree.

- [PR #25 CI](https://github.com/cam11505/website_trans/actions/runs/38398895335): 27 files / 106 passed; [CodeQL](https://github.com/cam11505/website_trans/actions/runs/38398893125) passed on 3393e118e7f595a38a3dfbf1cade65632af4c63e.
- [PR #26 CI](https://github.com/cam11505/website_trans/actions/runs/38403132825): 30 files / 126 passed on b517218cc090678a1b3cfb32be0d0a1e0c41ff1a. Its feature base produced no CodeQL check.
- [PR #27 CI](https://github.com/cam11505/website_trans/actions/runs/38409710958): Ubuntu / Node 20.19.0 / pnpm 10.34.5, 32 files / 162 passed / zero skipped on 2d608c49ae057ca59e47cf87343b73ad1d197d2b. Linux case-collision, reserved-name, FIFO and file-symlink cases ran. Its feature base produced no CodeQL check.
- Prior Windows / Node 24.19.0 run: 32 files / 158 passed / 4 Linux-only skipped; directory junction/root/output-alias rejection exercised.
- Release Check: eight checksummed files, 29 runtime packages, version/help/report smoke. Real bundled inventory smoke checks six source hashes unchanged, two missing references and network guards; CI runs this after bundling.

These links describe earlier stage heads. The consolidated PR targets **main** and must run all five checks, built/bundled CLI smoke and CodeQL on its own exact head before merge is considered. Record current results in its PR description instead of inheriting the previous passes. To reproduce locally:

```bash
pnpm lint
pnpm audit:dependencies
pnpm typecheck
pnpm test
pnpm build
pnpm release:check
node apps/cli/test/packaged-inventory-smoke.mjs
```

## Remaining risks and next decisions

- No actual Weebly export sample is available. Generic inventory was expressly authorized as the narrower phase; no official Weebly archive or full import claim is supported.
- Inventory is a read-only scan, not an atomic snapshot against a hostile concurrent writer. Stop writers before inspection. Text byte limits do not provide a CPU watchdog; raised limits need memory assessment.
- Responsive image lists, dynamic services/JS routes, unsupported encodings, fragments and several markup/asset semantics require review. Checksums and resolved local files do not prove complete source coverage or visual/functional parity.
- The original PR #28 tree did not repair dependency alerts. The security follow-up described above patches its branch; main/release still need approved integration and rescanning. Dependabot PR #22 remains open. The formal Node runtime baseline and additional platform CI remain SR-007; a local Node 24 pass does not change engines or .node-version.
- ADR-020 through ADR-023 remain Proposed. Narrow implemented interfaces do not accept the broader acquisition/snapshot/coverage proposals.

After the candidate passes all required checks, merging main still needs explicit user authorization under the original no-automatic-merge instruction. A merge authorization does not authorize a tag or release. The next feature should be selected explicitly after this review. Completing official Weebly import requires an authorized sanitized sample; implementing snapshot/replay or other backlog items needs its own scoped acceptance criteria. This integration does not start another stage.
