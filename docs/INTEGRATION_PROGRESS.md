# Site Rescue development integration — updated 2026-10-14

The current **unreleased review candidate is [Draft PR #29](https://github.com/cam11505/website_trans/pull/29)** on `codex/security-dependency-alerts`, targeting main directly. Its history includes the original integration PR #28, documentation from PR #23 and implementations from PR #25, #26 and #27, plus dependency security maintenance. It is based on main `37798cb3aa71170c0ad60b513a6ae6863da6df67`. The original PRs remain available for focused review and regression evidence; they do not have to be merged first to review this complete candidate. No automatic merge, version bump, tag or release is included; the published bundle remains v0.1.0.

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

繁體中文進度：八項 Roadmap 中，**兩項完成實作、一項部分完成、五項尚未開始**。這是項目狀態，不代表各項工作量相等；完整離線救援目標仍未完成。所有新增程式目前在 review branch，不能把 Draft PR 狀態當作已進 main 或正式發版。

## Try the integrated source

```bash
git clone --branch codex/security-dependency-alerts https://github.com/cam11505/website_trans.git
cd website_trans
pnpm install --frozen-lockfile
pnpm build
node apps/cli/dist/index.js --help
node apps/cli/dist/index.js inspect-source ./fixtures/shared/html-directory --output ./inventory-review
```

The fixture is synthetic and deliberately contains missing references, an external link, a query and inert source script. The inventory must require review and state that migration is not assessed. Exit 0 means an inventory was written; it does not mean migration ready. Use a new output directory on every run, separate from source inputs.

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
