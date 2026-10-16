# ADR-025: Versioned generic directory source snapshots and offline parser replay

- Status: Proposed — implemented for review in the SR-004 follow-up
- Date: 2026-10-16
- Scope: generic HTML directory snapshots/replay on top of SR-003 PR #30

## Context

The user requested the next development step after the generic offline importer. PR #30 is still Draft; this branch builds on its unchanged commit, without merging it. Its original-byte copies and output-only Inventory/import provenance were deliberately not replay contracts. Add an explicit versioned contract rather than interpreting those old JSON outputs as trusted parser input. No real Weebly sample is required for this generic directory scope.

## Decision and boundaries

Add `source-snapshot` for metadata validation and bounded reading, leaving acquisition in `html-directory` and normalization in the existing generic adapter. New `import-source` outputs include `capture/source/source-snapshot.json`, beside the original `files/` directory. `replay-source <snapshot-directory>` reads this fixed-name index, verifies the complete enumerated source file set against its byte sizes and SHA-256, then acquires verified copies into a fresh destination and re-runs the current generic adapter, asset pipeline, export, report, verifier and bundle manifest. It never reads the old `site.json` or requires the original selected source folder. Source/output overlap is rejected relative to the whole snapshot directory, not only its files subdirectory.

The acquisition boundary accepts optional expected file records. Their paths are comparison data only, never filesystem read targets. The bounded walker enumerates actual files, rejects symlinks/junctions/special files and unsafe names, hashes bytes and compares the exact ordered file set before adapter normalization. Existing per-file bounded read/hash checks and the final rescan pin acquisition to those verified bytes; a changed/missing/extra file aborts and removes only new output. Rebuilt outputs contain another independent copy of the original evidence and the same deterministic source index. Integrity protects accidental corruption relative to the selected index, not authenticity: coordinated edits to both bytes and the index require a trusted out-of-band bundle hash/signature to detect.

## Source Snapshot 1.0.0 contract

The strict index contains:

- `snapshotVersion: "1.0.0"`, `acquisition: "html-directory"`, original `acquiredAt` (UTC ISO timestamp), `adapter: "generic-html"`.
- `mappingOrigin: "https://site-rescue.invalid/"`, `publicOrigin: null`, `filesPath: "files"` and `homePath: "index.html" | "index.htm"` (root index preference matches acquisition).
- `sourceCompleteness: "unknown"`: full enumeration is not proof that an original website backup was complete.
- Canonically sorted file records: portable relative POSIX `path`, `kind`, original `bytes`, lowercase SHA-256 and matching synthetic `sourceUrl`. The file location is `files/<path>`. HTML/CSS kind is an extension-based media hint, not content authentication. No absolute local paths, cookies, tokens, request headers or original-domain guesses are stored.

Source URLs are only mapping identifiers, never network targets. Replay uses the same local-only asset transport. The current resource limits are supplied by the user/defaults, not accepted from an untrusted stored limits object. Snapshot index reads/writes have a fixed 4 MiB limit (including UTF-8 JSON bytes) and at most 100,000 descriptors; high Inventory overrides cannot bypass this metadata limit. Metadata is a fixed regular file read with final-component no-follow where supported, bounded chunks, canonical paths and pre/post metadata checks. Unsupported versions, unknown fields, malformed UTF-8/JSON, traversal/non-portable names, duplicate/case/NFC collisions, unsorted files, inconsistent home paths or synthetic URLs are rejected. Current Inventory limits govern source bytes/references independently.

## Compatibility and CLI behavior

Site 1.0.0/1.1.0 reading, output Site 1.1.0, Inventory 1.0.0, import-source provenance 1.0.0 and rescue manifest 1.0.0 are unchanged. Snapshot files already live under `capture/`, so whole-bundle hashing needs no new role. Existing import outputs gain one additive file; old readers still validate the Site and whole-bundle manifest. Old SR-003 evidence without an explicit snapshot index is rejected for replay with an instruction to re-import the saved original `files/` directory; there is no silent upgrade of an output-only contract. The old live URL capture/rescue outputs do not gain a snapshot in this change.

Every replay retains `offline-html-import` and adds `source-snapshot-replayed`, always keeping `review-required`. Timestamp in the new Site describes the new normalization; original acquisition time and byte provenance stay unchanged in the snapshot index. Static verification failure returns 2 and retains evidence/report with no bundle manifest. Fatal format, integrity, safety or resource errors return 1 and clean up only the fresh output; existing source/output is preserved. No source JS/active content is executed, and no source/public network call is allowed. Generated output can still contain unresolved external references, as documented by ADR-024.

## Limits and deferred work

This is the generic offline portion of SR-004, not live crawler snapshot acquisition, a parser compatibility guarantee across future changes, ZIP support, official Weebly archive certification or the broader SR-005 coverage model. Stop source/snapshot writers: portable metadata/hash checks are not atomic isolation from a hostile concurrent process. Snapshots are append-to-new-output/read-only by application policy, not made OS-immutable. Parsing byte limits do not provide a CPU watchdog. PR #30 remains an unmerged dependency; no automatic merge, tag, package version bump or release is included.

## Validation

Regression tests precede implementation. Cover missing/invalid/oversized metadata, version/path/origin/collision validation, changed/missing/extra source files, symlinks/junctions, resource limits, output overlap/aliases/existing output, unchanged source hashes, replay after removing the original folder and invalidating old normalized JSON, repeated deterministic replay, current-adapter normalization and real bundled network-guarded CLI replay. Run all five checks, dependency audit, Linux CI and exact-head CodeQL; record actual results in the PR.
