# Project status — Site Rescue

Updated: 2026-10-22 (Asia/Taipei). This is the current-state entry point. Historical review notes and stage records do not override this page. Always recheck live GitHub state at the start of a session.

## Delivery state

| Layer | Verified checkpoint | Meaning |
| --- | --- | --- |
| Published download | v0.1.0, 2026-08-22 | Historical CLI ZIP; later recovery work is not released |
| main | d8834de7dacedb020b4b96e907e23e1f93b1e3b8 | PR #29 merged on 2026-10-14; SR-001/002, generic Inventory and dependency fixes |
| Complete runtime candidate | Draft PR #34, de0b991d3bc6b332561d2cbcf17ae44a7c377c70 | Contains unchanged #30–#33 plus SR-007 and its portability repair; not merged/released |
| Continuation documents | docs/codex-continuation-20261022, based on the candidate above | Current status, concise handoff, execution queue and archived planning review; documentation changes only |

The runtime candidate is six commits ahead of the verified main and zero behind. This is a checkpoint, not a permanent mergeability promise. The continuation branch adds documentation commits; candidate CI results below belong to de0b991, not to later commits.

## Feature scope

| ID | main | Complete candidate | Still outside implemented scope |
| --- | --- | --- | --- |
| SR-001 crawl truncation | Merged | Included | Older missing evidence may require recapture |
| SR-002 semantic inline content | Merged | Included | Arbitrary DOM, visual and functional parity |
| SR-003 offline acquisition | Inventory only | Generic UTF-8 HTML folder import, #30 | ZIP container support and verified official Weebly formats |
| SR-004 source snapshot/replay | Not implemented | Generic offline Snapshot 1.0.0 and replay, #31 | Live URL raw-source Snapshot acquisition/replay |
| SR-005 evidence-based reports | Earlier report model | Report 2.0.0, #32 | Proof of original-site completeness or visual equivalence |
| SR-006 exact query mapping | Not implemented | Stable query paths/aliases/handoff, #33 | Automatic production-host query routing; folder query variants remain file-only |
| SR-007 runtime/platform CI | Earlier Node20/Linux baseline | Node24.22.0, pnpm10.34.5, three-platform CI, #34 | Platforms/architectures not actually tested |
| SR-008 guided UX | Not implemented | Not implemented | Next focused feature: terminal wizard |

Issue #24 is closed. At this checkpoint the 11 open issue-API entries are all PRs, not 11 standalone bugs.

## Verified candidate evidence

[CI 38920677453](https://github.com/cam11505/website_trans/actions/runs/38920677453) and [CodeQL 38920672288](https://github.com/cam11505/website_trans/actions/runs/38920672288) succeeded on **de0b991d3bc6b332561d2cbcf17ae44a7c377c70**. Jobs and decoded logs were inspected for the 2026-10-22 review.

| Runner | Test files | Passed | Skipped |
| --- | ---: | ---: | ---: |
| Ubuntu24.04 / x64 | 37 | 244 | 0 |
| Windows2025 / x64 | 37 | 238 | 6 |
| macOS15 / arm64 | 37 | 242 | 2 |

All platforms passed frozen install, lint/typecheck/test/build, CLI/release checks and all five bundled offline smokes. Linux audited the shared lockfile and reported no known vulnerabilities at that run. Platform skips cover filesystem/privilege-dependent fixtures; Linux ran every case. These are historical exact-commit results, not a fresh dependency audit or certification of every machine.

No new runtime tests, real Weebly format validation or release are implied by this documentation handoff.

## PR consolidation queue

- #34 contains #30–#33. Review the complete candidate and focused stage commits; do not blindly squash each overlapping main-base PR in sequence.
- #23/#25/#26/#27/#28 appear incorporated through merged #29. Verify their diffs before proposing superseded closure.
- #22 overlaps the Vitest update in #29. Check actual dependency/lockfile differences before proposing closure.
- Closing PRs, merge and release are separate actions. This handoff performs none of them.

## Documentation ownership

- [CODEX_HANDOFF.md](./CODEX_HANDOFF.md): how the next Codex session starts.
- [NEXT_STEPS.md](./NEXT_STEPS.md): execution queue and acceptance criteria.
- [2026-10-22 review](./reviews/2026-10-22-project-review.md): full original analysis and planning rationale; historical statements are dated.
- [INTEGRATION_PROGRESS.md](./INTEGRATION_PROGRESS.md): historical stage evidence.
- [ADR index](./adr/README.md): decision status; narrower implementation does not accept every broader proposal.
