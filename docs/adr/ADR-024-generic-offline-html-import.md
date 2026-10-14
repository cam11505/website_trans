# ADR-024: Generic offline HTML directory acquisition and import

- Status: Proposed — implemented for review in the SR-003 follow-up
- Date: 2026-10-14
- Scope: user-authorized generic HTML folder import; no real Weebly sample prerequisite

## Context and authorization

PR #29 merged the bounded Inventory phase into main. The user subsequently instructed development to continue without requiring real samples. This permits a generic directory contract tested with synthetic fixtures; it does not establish facts about an official Weebly backup format. This narrower decision extends ADR-023 without accepting the full ZIP/snapshot/replay proposals in ADR-020.

## Decision

Add `html-directory` as the acquisition/mapping boundary, keeping `source-inventory` read-only. `import-source <directory>` acquires all enumerated regular files into a fresh `capture/source/files` evidence copy, verifies their original size/SHA-256, normalizes every HTML page using the existing generic adapter, then uses the existing asset pipeline, exporter, report, verifier and bundle manifest. It has no network fallback and never executes source content. It does not choose the Weebly adapter from branding or assume an official layout.

Supported input is a portable directory with a root `index.html` (preferred) or `index.htm`, standard UTF-8 HTML/CSS, and ordinary static references. All HTML pages are included, even unlinked pages. Symlinks/junctions/special files and ambiguous names are rejected by Inventory. Uninspectable HTML/CSS (encoding, size or CSS parse failure) and `<base href>` abort with an actionable error, rather than dropping pages or inventing base semantics. ZIP/TAR input is rejected; no extraction occurs.

`https://site-rescue.invalid/` is a fixed **synthetic URL mapping namespace**, never a claimed original/public URL and never fetched. URL components are encoded per source path segment. Inventory-resolved directory-index aliases are canonicalized before normalization. Query-bearing file references map to the actual disk file without query, retaining fragments and explicit query warnings; this does not implement query-generated pages (SR-006). Ordinary ASCII page paths retain their relative paths; URL-sensitive/non-ASCII names map deterministically to `offline-pages/<SHA-256 of original path>.html` to avoid ambiguous browser/file decoding. Exporter collision rejection remains authoritative, including generated-path collisions.

Common inventoried HTML URL attributes and stylesheet references use the recorded file mappings. Unsafe references are made inert in normalized input. Missing/external dependencies stay recorded with warnings; the offline asset transport opens only entries in the acquired file map and verifies saved bytes before use. The existing pipeline copies images/media, linked attachments and bounded CSS dependencies into content-addressed output assets. Exporter URL-to-local-asset mapping also preserves inline/navigation attachment links and fragments. Original CSS/HTML bytes remain unchanged in the evidence copy. Source styles remain an explicit `--style-mode source` option; source scripts are never included as generated executable script tags. Browsing generated output can still contact unresolved external resources; review the report before preview/deployment.

## Contracts and compatibility

- `capture/import-source.json` is a new output-only provenance document with `importVersion: "1.0.0"`, `sourceKind: "html-directory"`, mapping origin, `publicOrigin: null`, home path, fixed relative evidence paths, per-page source URL/target path/original hash, scope and review-required flag. It does not expose an absolute local source path or assert a public origin.
- `capture/source/source-inventory.json` retains the existing Inventory 1.0.0 contract and describes original bytes, not transformed CSS or full migration coverage. Its inventory-only fields are intentionally unchanged.
- Evidence files reside under `capture/`, so the existing rescue manifest 1.0.0 hashes them without adding a file role or changing manifest readers. This evidence copy is not a replay input or a new accepted snapshot schema. SR-004 remains separate.
- Normalized Site stays 1.1.0, with existing 1.0.0/1.1.0 readers. Existing live commands, adapter contracts and package/release versions are unchanged.
- Every import records `offline-html-import` and existing generic conversion warnings, keeping report readiness `review-required` even when static verification and bundle hashes pass.

Exit 0 means output was generated with valid supported static references, not complete migration. Exit 2 retains output/report for failed static verification and does not write a bundle manifest. Fatal format/safety/resource errors return 1 and remove only the fresh generated output. Existing outputs are never overwritten. Source/output overlap (including aliases/ancestors) is rejected before any output creation.

## Limits and remaining risks

Reuse Inventory defaults and positive-safe-integer CLI overrides: 10,000 entries, depth 16, 64 MiB/file, 256 MiB total, 2 MiB/text file, 20,000 references. Acquisition uses bounded reads with file metadata, canonical component paths and hashes checked before/after; a second inventory detects common additions/removals/changes. Asset reads use the verified saved map, not filesystem paths derived from references. Evidence requires roughly source-size disk space plus transformed assets/output; peak memory includes a few per-file buffers and the existing bounded asset pipeline. Large override values need available-memory assessment; no CPU watchdog is added.

Stop concurrent writers: this is not atomic filesystem isolation against a hostile process swapping parents at syscall boundaries. Source HTML/CSS is parsed, never run. Dynamic services, scripts, responsive/lazy media, original layout, absolute original-domain URLs, unknown encodings and browser parity remain manual review items. No official Weebly format certification, ZIP, live source snapshot/replay, complete coverage model, runtime migration, GUI, deployment or release is included.

## Validation

Write regression cases before implementation, then run lint/typecheck/test/build/release checks and full dependency audit. Test offline full pipeline, directory aliases, UTF-8/URL-sensitive names, unlinked pages, nested/fragment/attachment links, CSS imports/assets, copied source hashes, deterministic mapping, missing/external/unsafe/query warnings, source mutation/tampering, output containment/aliases, symlinks, resource limits, unsupported formats and exit behavior. Exercise actual bundled import/verify-bundle with network calls blocked in CI. Record exact results in the PR; this proposal does not itself merge or release anything.
