# ADR-026: Separate migration coverage, integrity and manual review evidence

- Status: Proposed — implemented for review in SR-005
- Date: 2026-10-16
- Scope: report correctness and structured acquisition evidence on top of PR #31

## Context

The user requested the next step after offline Snapshot/replay. Existing Report 1.0.0 labels a warning-free normalized Site `ready` even when source completeness, generated references and deployment have not been checked. A checksum field alone also increments a field named `verifiedLocalAssetCount`. These are distinct claims. The report must distinguish evidence for observed acquisition, conversion limitations, generated static references and manual deployment review without inventing a source coverage percentage.

## Decision

New reports use **Report 2.0.0**, because readiness semantics and a summary field change. They always use `readiness: "review-required"` while source completeness is unknown and manual review is not assessed. There is no automatic manual-approval or completeness certification interface in this phase. Existing Site 1.0.0/1.1.0, Inventory 1.0.0, import provenance 1.0.0, Snapshot 1.0.0 and rescue manifest 1.0.0 contracts are unchanged. Package/release versions are unchanged for unreleased development.

Report 2.0.0 separates four dimensions:

1. `coverage.sourceAcquisition`: `unknown`, `partial` or `observed-scope-complete`, plus **always unknown original website completeness** and optional structured evidence. Complete observed scope means the bounded crawler exhausted its queue without acquisition warnings/truncation, or the folder's supported references were inspected without known missing/unsafe files and all inventoried HTML was normalized. It is not a complete-original-site claim. Redirect aliases and discovered URLs need not equal captured pages; no percentage or inferred total is calculated.
2. `coverage.conversion`: `no-known-losses` or `review-required`, **completeness not proven**, and unsupported raw/embed block count. Known conversion warnings and unclassified future warning codes require review; no known losses does not prove DOM/layout/semantic equivalence.
3. `coverage.staticIntegrity`: `not-checked` unless the generated static verifier actually ran, otherwise `valid`/`invalid` with its file/reference/issue counters. It describes supported generated references, not source coverage, external availability, browser behavior, all asset bytes or bundle authenticity. `summary.checksumRecordedLocalAssetCount` replaces `verifiedLocalAssetCount`; recording a checksum does not run a byte check.
4. `coverage.manualReview`: `not-assessed` and explicit content/layout/dynamic-service/redirect/deployment checks. All existing warnings and review items remain visible. Warning groups classify known acquisition/conversion/asset codes; unknown codes remain in `unclassified`. Counts use own-property-safe keys, including prototype-like warning codes.

Markdown and CLI summaries explain these limits. `report <site.json> --site-directory <generated-directory>` explicitly runs static verification; standalone reports without that option say not checked. Rescue/import/replay run verification before report generation and pass the actual result. A report command still returns 0 when a report is written, even if it records invalid static references; `verify` and workflow exit-code semantics remain distinct.

## Structured acquisition evidence

New captures/imports/replays add fixed-name `capture/acquisition-evidence.json`, with `evidenceVersion: "1.0.0"`, a SHA-256 binding of `JSON.stringify(parseSite(site))`, and one strict discriminated acquisition record:

- Live: normalized/captured/discovered page/URL counts, acquisition warning count, redirect count, truncation and the page limit. Values come directly from CrawlResult, never parsing free-form warning messages.
- Folder/replay: mode, inventoried HTML and normalized page counts, original file count/bytes, missing/external/unsafe reference counts and supported reference-inspection status from the bounded Inventory.

The binding covers validated normalized Site data, not raw JSON whitespace/unknown fields. Whole-bundle hashing covers raw artifact bytes separately. Missing evidence is legitimate for older/standalone Sites and yields unknown metrics; a present invalid, stale or mismatched sidecar fails explicitly. Reads are bounded to 1 MiB, strict UTF-8 JSON with regular-file/no-symlink checks, final-component no-follow where supported and pre/post metadata checks. Stored counts cannot initiate filesystem reads or network calls. The evidence and Site can still be jointly forged; this is provenance/integrity within the selected workflow, not external authentication.

## Bundle and legacy compatibility

Freeze the original 1.0.0 generator/Markdown renderer for validation only. The bundle verifier dispatches by stored report version: old JSON and Markdown must still exactly match the old algorithm. Version 2.0.0 must exactly match the current Site and optional bound sidecar; if it records static checks, recompute them against the current generated directory. A report that says not checked remains not checked as-of-report, even when later bundle validation independently runs static verification. Unsupported versions or altered metrics are rejected. Existing bundle hashes still detect modified/missing/extra artifacts. There is no manifest version/role change because the new evidence is inside capture/.

Static verification passes cannot manufacture acquisition metrics or clear manual review. Old 1.0.0 reports may still contain the historical `ready` wording; accepting their bytes is not re-certification of completeness. Regenerate a report with this CLI to obtain the stricter semantics. Legacy golden fixtures retain LF bytes across platforms.

## Scope and remaining limits

This does not measure true conversion accuracy, discover hidden source pages, certify an original backup, authenticate sidecars, execute source scripts, add ZIP/live snapshots, change query routing, migrate runtimes, deploy or release. Source/output writers must be stopped; checks are not atomic isolation against a hostile concurrent process. Existing caller-controlled output behavior remains. PR #31/#30 remain unmerged dependencies; this main-base Draft PR contains their unchanged history for exact-head CI/CodeQL.

## Validation

Regression first: warning-free old Site must remain unknown/review-required; truncated/full/failing live crawls retain distinct metrics; folder/replay evidence remains separate from valid output; stored checksums are not called verified; explicit static checks can fail without certifying source coverage; mismatched evidence is rejected; unknown/prototype-like warnings remain visible; old Report 1.0.0 bundles still verify byte-exactly. Add actual bundled network-guarded coverage checks, rerun all five checks/audit, and record exact-head Linux CI/CodeQL.
