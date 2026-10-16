# ADR-028: Node 24 LTS baseline and three-platform CI

- Status: Proposed — implemented for review in SR-007
- Date: 2026-10-16
- Supersedes: runtime-baseline portions of ADR-002 and ADR-017 for new development packages only
- Scope: unchanged PR #33 plus runtime, release-tool consistency and CI; no feature/schema changes

## Context and verified selection

The source and CI still advertised Node >=20.19.0 while local development used Node24. Node20 is end-of-life according to the [official release status](https://nodejs.org/en/about/previous-releases). The [official distribution index](https://nodejs.org/dist/index.json) was checked on 2026-10-16: [24.22.0](https://nodejs.org/en/blog/release/v24.22.0), released 2026-10-14, is the latest Node24 LTS patch. Local Node24.19 passes from previous stages do not establish this new baseline's compatibility.

The existing Ubuntu-only CI cannot validate Windows junctions or macOS filesystem differences. Its ubuntu-latest image is also scheduled to change. GitHub requires the stable `Quality checks` status; expanding a matrix must not silently remove that protected-branch gate.

## Decision

- Pin `.node-version` to **24.22.0**, retain `packageManager: pnpm@10.34.5`, and declare root/generated package `engines.node: >=24.22.0 <25`. Node22, Node20, odd Node25 and untested Node26 are outside the new support contract. Future runtime updates need fresh validation; no automatic LTS/network lookup is added to the product.
- Derive the esbuild Node target from `.node-version`, and reject an unpinned/non-Node24 value or a mismatching root engine range before bundling. This prevents release metadata and generated syntax from quietly using different runtime assumptions. This check validates the build contract; package engines are not a custom CLI runtime launcher/enforcer.
- Run frozen install, lint, typecheck, tests, build, built CLI help/version, release check and all five network-guarded bundled smokes on **ubuntu-24.04, windows-2025 and macos-15** using the same pin. Linux performs the dependency audit once for the shared lockfile. Set fail-fast false so a failure does not hide other platforms' results.
- Keep an always-evaluated aggregate job named **Quality checks**, requiring the whole matrix result to be success. Failed, cancelled or skipped platform work cannot satisfy this gate. Do not change repository protection settings.
- Upgrade to Node24 Actions, pinned to dereferenced commit SHAs verified against official release tags: [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) `3d3c42e5aac5ba805825da76410c181273ba90b1`; [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) `949feb2413d6458794dcd2491c4babbbce0c15c1`; [pnpm/action-setup v6.1.0](https://github.com/pnpm/action-setup/releases/tag/v6.1.0) `ea17c68df8912ef543352723c149a84f56e3d413`. Each action.yml declares node24. pnpm setup reads the root packageManager rather than duplicating the version.
- Preserve read-only workflow permissions and disabled persisted checkout credentials. CodeQL default setup remains GitHub-managed; do not claim its internal runner configuration is controlled by this CI file.
- A case-collision fixture requires two differently cased files to exist. Skip that case when the actual test filesystem cannot represent them (default macOS volumes), keeping the Linux rejection test intact. Windows-only and Unix-only safety cases remain explicit; no product safety rule is weakened.
- Full local Windows tests twice reproduced EPERM when committing a completed release staging directory; isolated reruns passed. Retry only EPERM/EBUSY directory rename up to three times (100/200/400ms), without rebundling or changing path/output protections. Persistent locks still fail and clean staging; other errors fail immediately. Deterministic injected-error regressions cover recovery and the bounded failure path.
- The first real matrix exposed generated evidence reads rejecting macOS temporary-directory aliases and Windows runner short-name paths. Canonicalize the freshly created capture root before creating `source/files`, then retain every existing descendant lstat/realpath/stat/hash check. Do not relax source-root or descendant symlink/junction rejection. An explicit output-parent alias regression reproduced the failure locally before this one-line correction; post-acquisition files-root replacement must still fail. Mutation-test hooks compare canonical source paths so the fixture still triggers under OS aliases.

## Compatibility and limits

Raising the supported runtime is an intentional requirement change for this unreleased development tree and newly generated packages. It does not alter the already published v0.1.0 archive, its historical metadata or accepted ADR history. Recommend maintained Node24 for old artifacts too, but do not rewrite their original requirements or claim a new release. Package version remains 0.1.0 solely for the existing unpublished integration policy; a future release needs its own version/review decision.

No CLI/source/schema/report/snapshot/query-mapping contract changes. No native executable, installer, archive publication, OS/CPU-wide support claim or production visual/functional equivalence claim. CI proves the specific hosted runner images/architectures actually used, not every Linux distribution, Windows version, macOS release or CPU. The runners' software images can receive maintenance within their labels. Run release gates on the exact future release commit and repeat archive verification before publication.

This main-base Draft PR includes unchanged #30–#33 dependencies. No merge, tag, package publication or release is authorized.

## Validation

Before implementation, six release-tool regression cases failed: pinned target propagation, four invalid runtime pins and engine/pin mismatch. After implementation run all repository checks on the actual pinned local runtime, all five actual bundled smokes, security audit, then require exact-head CI on all three platforms and CodeQL. Record actual counts, platform-specific skips, transient failures and limitations in the PR; previous-stage passes are not evidence for this change.

Before staging retry, three additional regressions failed (transient EPERM/EBUSY recovery and bounded persistent EPERM); immediate EACCES rejection already passed. This maintenance is scoped to actual cross-platform release verification, not importer/source behavior.

First matrix run `38920048502` failed on Windows/macOS while Linux passed; the aggregate gate failed as intended. Record the later repaired head's full results, not only this initial failure or a rerun of the old head.
