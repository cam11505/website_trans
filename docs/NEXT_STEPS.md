# Site Rescue — next execution steps

Updated: 2026-10-24. Read [PROJECT_STATUS.md](./PROJECT_STATUS.md) first. The full original plan is preserved in [the review](./reviews/2026-10-22-project-review.md).

Current execution: Stage A review is recorded in [2026-10-24 integration review](./reviews/2026-10-24-integration-review.md); no PR closure/merge performed. Stage B is implemented in the wizard follow-up, with actual validation in its Draft PR and scope in ADR-029. The acceptance lists below remain the review checklist. Stage C has not started and is not release authorization.

## Stage A — consolidate the existing candidate

Scope: review and documentation. Keep #34 runtime behavior unchanged.

Already prepared in this handoff:
- Single current-state page, concise Codex entry point and this execution queue.
- Full original review retained with a historical label.
- README contradictions and agent routing corrected.
- Historical integration record clearly separated from current delivery status.

Remaining acceptance:
- Recheck current main and all relevant PR heads.
- Confirm #34 includes #30–#33; inspect individual stage commits for focused review.
- Compare old #23/#25–#28 and Dependabot #22 before proposing superseded closures.
- Inspect the continuation commit's documentation-only diff, links and any CI results.
- Prepare a concrete integration recommendation with compatibility, actual test evidence and remaining limits.
- Do not close/retarget other PRs, merge, tag or release automatically.

This documentation PR is stacked onto #34's branch to keep its review diff limited to documents. If #34 merges first, rebase the documentation work onto current main after checking the squash-merge relationship. Never replay the full already-merged feature history blindly.

## Stage B — implement the smallest SR-008 terminal wizard

Command: `site-rescue wizard` (implemented by the follow-up, not by the original documentation handoff).

Scope: generic HTML folder only. Reuse the existing core:
1. Choose a source folder and a new separate output path.
2. Analyze in memory; show pages/files, missing references and unsupported items.
3. Show the destination and planned writes; obtain the product user's execution choice.
4. Call the existing import-source orchestration.
5. Show actionable results, report/site locations and a preview command.
6. Start the existing preview only when chosen.

Acceptance:
- Source files remain unchanged; source/output overlap and existing destinations reject.
- Cancellation does not create rescue output. If analysis writes evidence, disclose those writes before execution; inspect-source is not a zero-write API.
- Cover paths with spaces and Traditional Chinese characters.
- Preserve existing direct commands for scripting. Define non-TTY behavior explicitly; fail with useful guidance rather than hanging for input.
- Preserve exit semantics: 0 supported static workflow success; 1 fatal error; 2 generated static verification failure. review-required remains a separate review state.
- Separate page counts, static reference checks, actual bundle verification and manual review. Only claim a check passed if it actually ran.
- Test success, cancellation, invalid input, output safety, static failure and noninteractive behavior with offline fixtures.
- All existing five packaged smokes and three-platform quality checks pass for the new head. Exercise the actual bundled wizard, not only source-level imports.
- Keep changes focused; no ZIP, Live Snapshot, new report schema or GUI in this PR.

Suggested implementation: apps/cli/src/wizard.ts with injectable input/output; a small shared orchestration extraction only if needed. Do not introduce a framework or duplicate business logic for one command.

Deliverable: a focused Draft PR with code, fixture/regression evidence, actual validation and compatibility notes.

## Stage C — prepare a v0.2.0 candidate

This is a version recommendation, not release authorization. The combined changes add offline acquisition, Snapshot/replay, Report2, query mapping and a new Node baseline.

Acceptance:
- One traceable clean candidate commit.
- Package version, CLI --version, release metadata and docs agree; data-schema versions remain independently documented.
- Preserve Site1.0/1.1 and legacy Report1 bundle cases.
- A public synthetic HTML folder example, expected output, short walkthrough and readable report.
- Input matrix: generic UTF-8 folder supported; ZIP unsupported until implemented; official Weebly formats unverified; Live Snapshot unavailable.
- Validate the actual release package, notices/licenses, checksums and three-platform end-to-end workflow.
- Manually walk source -> import -> report -> preview -> move original source -> replay Snapshot -> verify bundle.
- Merge and release require separate explicit decisions; do not reuse #29 approval.

## Later isolated tasks

| Order | Task | Evidence of completion |
| --- | --- | --- |
| A | Live URL source snapshots | Preserve raw HTML/URL/redirect/assets evidence and reparse without contacting the original site |
| B | Safe ZIP container input | Isolated bounded extraction into the existing folder pipeline; traversal, collision, symlink and decompression-limit cases |
| C | Verified official Weebly formats | Authorized sanitized samples and an explicit tested-format matrix |
| D | Media/content fidelity | Prioritize srcset/lazy media, unsupported blocks and external dependencies using observed missing-content reports |
| E | Local GUI | A stable CLI flow and real usability feedback; reuse the same core |

Do not block general folder, wizard or generic ZIP work on the availability of a real Weebly sample. Do not infer official Weebly support from generic synthetic tests.
