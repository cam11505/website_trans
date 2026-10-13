# ADR-023: Inspect local HTML directories before implementing offline import

- Status: Proposed — implemented for review in the SR-003 inventory draft PR
- Date: 2026-10-13
- Scope: the user-approved generic HTML directory inventory phase of SR-003

## Context

The handoff requests a fixture-verified offline importer. No authorized, sanitized official Weebly export sample is available. The user explicitly narrowed this phase to a generic HTML directory safety inventory using synthetic fixtures. This does not accept ADR-020, certify a Weebly archive layout, or complete the full SR-003 importer.

## Proposed decision

Add one platform-neutral `source-inventory` package and a thin `inspect-source` CLI command. Read regular files, record relative POSIX paths, byte counts and SHA-256, and inspect common HTML URL attributes plus CSS `url()`/`@import`. No source bytes are copied, changed, executed or fetched. Do not fabricate a public origin, call SourceAdapter normalization, produce `site.json`, or extract ZIPs.

Write deterministic `source-inventory.json` and `source-inventory.md` to a fresh, separate directory. Reject source/output containment in either direction, including existing parent aliases. The independent inventory contract starts at `inventoryVersion: "1.0.0"`; existing Site 1.0.0/1.1.0, migration report, rescue manifest and package versions remain unchanged. This is an output-only contract, not a replay input or snapshot manifest.

Every inventory carries `scope: "inventory-only"`, `reviewRequired: true`, and `coverage.migration: "not-assessed"`. `fileEnumeration: "complete"` means the bounded filesystem walk finished. `referenceInspection: "complete"` means the supported static reference checks finished, even if missing files were found; it does not mean every possible dependency or page was discovered. Skipped/unsupported inspection sets `referenceInspection: "partial"` and actionable warnings.

## Safety and limits

- Require a directory root; reject root/descendant symlinks (including Windows junctions), special files, non-portable filenames, and NFC/case-folded path collisions. Do not follow even internal symlinks.
- Count all entries, including empty directories, using bounded directory enumeration. Default limits: 10,000 entries, path depth 16 (root children have depth 1), 64 MiB per file, 256 MiB total, 2 MiB per inspected text file, and 20,000 recorded references. CLI overrides must be positive safe integers. Hard enumeration/hash/reference limits abort with exit 1 and no new inventory output. Text inspection limits instead retain checksums and report skipped inspection.
- Stream hashes in bounded chunks. Check actual bytes read and compare file/directory metadata and canonical paths before/after reading. Reject detected concurrent changes. Use final-component `O_NOFOLLOW` where supported.
- Resolve references only against the enumerated relative file set; never open referenced paths. Root-relative paths map to the selected directory root; relative paths map to the referring HTML/CSS directory. Reject traversal above root, unsafe schemes, encoded separators, malformed percent encoding, control characters and backslashes. Exact files and directory `index.html`/`index.htm` are supported; extensionless routing is not inferred.
- Record HTTP(S), protocol-relative, mailto and tel references as external without fetching. Data/fragment/empty references are classified as embedded; fragment targets are not validated in this phase. Query references check only file presence and require review.
- HTML `<base>` leaves local references unresolved. Warn for responsive image lists, foreign/template markup, embedded HTML, active content, unsupported encoding and malformed CSS. Parse UTF-8 HTML/CSS only. Other assets are hashed, not semantically analyzed.

Checks are best-effort detection during a read-only scan, not atomic filesystem isolation against a hostile concurrent writer. Stop source writers before inspection. No immutable snapshot is created, and a later change invalidates the recorded hashes as evidence of current bytes. Resource overrides should remain within available memory; text parsing is bounded by bytes, without a browser sandbox or CPU watchdog.

## Supported formats and compatibility

| Input | Evidence / behavior |
| --- | --- |
| Generic UTF-8 HTML directory | Synthetic fixtures cover inventory and common static references only |
| Directory with non-UTF-8/oversized HTML or CSS | Bytes inventoried; reference inspection skipped with warnings |
| Directory with no HTML / no root index | Inventory remains review-required with layout warnings |
| Official Weebly export ZIP or folder layout | Unverified; requires an authorized sanitized real sample before a platform importer |
| ZIP / TAR file | Rejected; no extraction or archive format detection |

CLI exit 0 means an inventory was written, including known missing files and warnings. It never means migration ready. Existing live capture/rescue/export/verify commands are unaffected. The published v0.1.0 bundle does not contain this new command; no release is authorized by this change.

## Evidence required for acceptance

Record regression failures before implementation, all five repository checks, actual bundled CLI smoke results, read-only source hashes, deterministic copied-folder outputs, containment and alias checks, traversal and malformed references, byte/entry/depth/reference limits, skipped text inspection, and source-change detection. Linux CI must exercise case collisions, reserved names, FIFO and file symlink rejection; Windows exercises directory junctions. Full SR-003 acceptance remains pending a verified format and offline import/export/report/verify pipeline.

Related: ADR-003, ADR-006, ADR-008, ADR-016; Proposed ADR-020 in Draft PR #23.
