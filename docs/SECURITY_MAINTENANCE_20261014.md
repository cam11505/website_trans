# Dependency security maintenance — 2026-10-14

This focused development branch follows integration PR #28. It repairs the five open GitHub dependency alerts selected by the user and compatible security issues discovered by a full npm audit. It does not merge main, publish a release, change the Node baseline or implement another roadmap feature.

Review update: [Draft PR #29](https://github.com/cam11505/website_trans/pull/29) now targets main directly and includes the entire PR #28 baseline plus these security fixes. The former feature-base CI passed, but produced no CodeQL check. Fresh main-base CI and CodeQL must verify the updated head; current results are recorded in the PR description. No prerequisite PR merge is needed to review this complete candidate.

## Reproduction and patch selection

Before changing versions, `pnpm audit --json` exited 1 with **22 package/version advisory entries**: 3 low, 9 moderate, 8 high, 2 critical. This differs from GitHub's five open default-branch alerts; the counts describe different inventories and are not independent vulnerability counts.

| Package | Before | Patched tree | Scope |
| --- | --- | --- | --- |
| vitest / @vitest/mocker | 3.2.7 | 4.1.11 | Development test runner; addresses GitHub alerts #1/#2/#3 |
| js-yaml | 4.3.1 | 4.3.2 | ESLint transitive dependency; alert #4 |
| undici | 7.29.0 | 7.29.1 | Cheerio runtime dependency; alert #5 and additional audit entries |
| brace-expansion | 1.1.18 / 5.0.9 | 1.1.21 / 5.0.12 | Same-major patches for lint tooling; additional audit entries |
| source-map-js | 1.2.1 | 1.2.2 | PostCSS runtime/development dependency; additional audit entry |
| tinypool | 1.1.1 | Removed from the tree by Vitest 4 | Two additional critical advisory entries |

Original GitHub advisories: [Vitest/mocker](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9), [js-yaml](https://github.com/advisories/GHSA-2883-xcg3-v3hh), [undici](https://github.com/nodejs/undici/security/advisories/GHSA-3wwx-pv8p-q78v). The audit also covered brace-expansion GHSA-q2hr-2g5m-vwhr / GHSA-qhr7-859c-m2p7 / GHSA-6j4f-fj2g-mc7p, source-map-js GHSA-68fv-2mgg-jv7q, and tinypool GHSA-5gmw-xhrv-c9v3 / GHSA-85c8-ppgw-ccpr.

Root Vitest moves to `^4.1.11`, the supported patched major; Vite remains 7.3.6. `pnpm-workspace.yaml` maps vulnerable transitive ranges to explicit patched versions in the same major. These overrides intentionally pin those matches and must be reviewed when parent dependencies or security advisories change. No advisory is ignored or dismissed. The frozen lockfile records exact versions and integrity hashes.

## Validation

The updated lockfile audit exits 0 with **zero known advisories at every severity** as of 2026-10-14. `pnpm audit:dependencies` runs `pnpm audit --audit-level=low`; CI runs it after the frozen install. This command needs registry access and fails on reported advisories or registry errors. Offline fixture tests remain offline.

Windows / Node 24.19.0 / pnpm 10.34.5 / Vitest 4.1.11: lint, typecheck, test, build and release check passed; **32 files / 158 tests passed / 4 Linux-only skipped**. No product source or test assertions needed changing for Vitest 4. Actual bundled rescue checked both adapters, inline markup, fragments, truncation review and bundle integrity. Bundled inventory checked unchanged source hashes, deterministic copies, missing references and safety failures. Release Check verified eight checksummed files and 29 runtime packages, including license notices.

CI must independently verify its exact head on the existing Node 20.19.0 baseline, including the four Linux-specific tests and bundled inventory smoke. Current results belong in the PR description rather than being inherited from PR #28.

## Compatibility and remaining gates

- Site schema 1.0.0/1.1.0, adapter contracts, CLI commands and package/release versions are unchanged. The formal runtime/platform policy remains SR-007.
- Vitest 4 supports development on Node 20, 22 and 24+; the pinned CI baseline and tested local Node satisfy it. This update patches npm dependencies, not Node's built-in components or an already-downloaded release binary.
- The existing published v0.1.0 ZIP and main are unchanged. GitHub default-branch alerts may remain open until these commits are merged and rescanned; a branch audit of zero is not a claim that GitHub has closed them.
- Dependabot PR #22 remains open. This change includes its Vitest target plus transitive fixes against the integrated tree; review duplicate dependency work before merging either PR.
- Official Weebly sample/import, snapshot/replay and remaining roadmap items retain the limits in [integration progress](./INTEGRATION_PROGRESS.md). No new stage is started.
