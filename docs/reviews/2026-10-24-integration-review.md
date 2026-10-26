# Stage A integration review — 2026-10-24

This is a review recommendation, not merge/closure/release authorization.

- Live main is `d8834de7dacedb020b4b96e907e23e1f93b1e3b8`; published v0.1.0 is unchanged.
- Runtime candidate #34 is `de0b991`, with the recorded successful three-platform CI/CodeQL on that exact head. Its six commits after main contain #30 import, #31 replay, #32 Report2, #33 query mapping and the two #34 runtime/portability commits.
- Documentation #35 is `eb8c22e`, one commit after #34, exactly eight Markdown files. No runtime, workflow, dependency or data-schema changes were introduced by that documentation commit. Its current-entry links and scope were inspected; its original Linux CI was red on the dependency audit, while Windows/macOS passed.
- New work starts on #35 so the current handoff is preserved; it does not rebase, force-push, retarget, close or merge any prior PR.

## Overlap evidence and recommendation

| PRs | Evidence inspected | Recommendation after human review |
| --- | --- | --- |
| #25/#26/#27 | #25 and #26 heads are ancestors of #27. `git diff <#27 head>..origin/main -- apps packages` is empty. Their runtime/tests are therefore already present in main, not merely inferred from titles. | Treat as superseded candidates; closure is a separate decision. |
| #28 | Compare its integration scope with #29/main; code and tests overlap the incorporated Inventory/inline/truncation work. | Do not merge the same feature history again. |
| #23 | Its introduced handoff/ADR paths are present in main; ADR-020 is unchanged, ADR-021 and handoff were subsequently updated. #35 preserves the later planning review and replaces obsolete starters. | Preserve latest documents; review before proposing superseded closure. |
| #22 | Both #22 and main declare Vitest ^4.1.11. The new audit now requires a later patch; old #22 cannot satisfy that requirement. | Do not merge an older duplicate update into the newer candidate. |
| #30–#34 | All stage commits are contained in #34; #35 contains #34 without runtime edits. | Review one complete integration candidate and focused stage diffs; do not squash overlapping main-base PRs in sequence. |

Recommend reviewing the new wizard candidate (including unchanged #30–#35 and its narrowly required security prerequisite) as one complete main-base Draft PR. Only consider main integration after its own exact-head checks pass and explicit authorization is given. Stage C versioning, archive publication and release remain separate.

## Newly blocking dependency audit

The #35 Linux log (`39717046955`) reported seven advisories on 2026-10-22. A fresh 2026-10-24 audit reported **11** (3 high, 7 moderate, 1 low). Main's GitHub dependency-alert count was zero at lookup; that default-branch service count is not the same evidence as this candidate's fresh lockfile audit.

Minimal prerequisite versions in the candidate:

| Dependency | Before | After |
| --- | --- | --- |
| Vitest / mocker family | 4.1.11 | 4.1.12 |
| Vite | 7.3.6 | 7.3.7 (bounded same-major override) |
| Undici | 7.29.1 | 7.30.1 (updated bounded override) |
| Zod, all three direct users | 3.25.76 | 4.6.7 |

The current [Vitest advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8), [Vite advisory](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [Undici advisory](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c) and [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) identify patched versions. Zod's reviewed range covers versions below4.6.6 and offers no v3 patch; the major upgrade is deliberate, not a hidden same-major override or an audit suppression. Existing schema expressions were retained. TypeScript declarations were rebuilt with `--force` to discard stale v3 incremental output.

After the prerequisite update, audit reports zero known npm advisories and the unchanged baseline tests pass locally (238 passed /6 platform skips, 244 total). The new head must also pass saved Site1.0/1.1, Snapshot, Site-bound evidence and byte-exact frozen Report1/Report2 bundle cases, plus all existing packaged smokes. Keep data-schema/package/release versions unchanged; invalid-input library error wording may differ. No v3 compatibility entry point is used as a workaround. npm audit is not certification of the embedded Node runtime, source completeness or every possible resource-exhaustion scenario.

## Compatibility and limits

Source inputs remain immutable and separate from outputs; Report2 remains review-required. Site1.0/1.1, Snapshot1, acquisition evidence, URL mapping, redirect manifests and rescue bundle formats remain independent contracts. Generic folders do not prove official Weebly archive support. ZIP, Live Snapshot, GUI and automatic hosting remain deferred. No PR closure, merge, tag or release performed by this review.
