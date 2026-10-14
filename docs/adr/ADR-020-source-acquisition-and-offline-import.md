# ADR-020: Separate source acquisition from platform normalization

- **Status: Proposed — not accepted**
- **Date: 2026-10-13**
- **Context:** Site Rescue is CLI-first/local-first and uses a SourceAdapter contract for platform detection and HTML-to-Site normalization. v0.1.0 capture/rescue only accepts a live URL, calls HTTP fetch + crawler and produces site.json/assets. It cannot rescue a site solely from a user's local Weebly archive or HTML directory.

## Decision proposal

Introduce a **platform-neutral Source Acquisition boundary** ahead of the existing SourceAdapter registry:

    Live URL -> bounded HTTP crawler -\
                                      -> Source Snapshot -> SourceAdapter -> Site -> Exporter
    Local ZIP / HTML directory ------/

- Acquisition handles **where bytes came from**, URL-to-file mapping, input validation, provenance, asset acquisition, and source integrity.
- The existing SourceAdapter handles **what platform/content means**, not archive decompression or network I/O.
- Support local HTML directories first where practical; support specifically verified official Weebly archive layouts when authorized sanitized fixtures exist.
- Maintain immutable original inputs and a manifest of raw HTML + assets + SHA-256 when possible. Do not mutate, overwrite, or delete source archives.
- Keep downstream Site schema/exporter platform-neutral; make import-vs-live provenance explicit without leaking Weebly-only fields.
- New package names such as source-input, importers/weebly-archive, importers/html-directory, source-snapshot are **illustrative**, subject to review; do not prematurely create multiple empty packages.
- Preserve existing live-URL CLI behavior and offer a distinct offline import command or source-type flag whose semantics are unambiguous.

## Source snapshot minimum contract (proposal)

For each source document/asset, retain: original source identifier, immutable saved relative path, URL if known, media type if known, acquisition mode, byte size, checksum, and any warning/failed acquisition evidence. Include a versioned index. Keep generated normalized Site separate so updated adapters can re-run without contacting the source site.

## Safety and correctness

Treat all imported archives as untrusted. Reject archive absolute/traversal paths, symlink escapes, unexpected special files and unsafe duplicate entries. Set maximum compressed/uncompressed bytes, entries, per-file size, depth and expansion ratio. Do not execute imported scripts or active content. Tests must use synthetic or authorized anonymized fixtures only.

Do not assume official Weebly account data downloads include all static pages, dynamic services, blogs, e-commerce, forms or membership content. Build a Supported Formats Matrix from real samples; unknown structures should report unsupported/incomplete rather than silently emit a false success.

## Considered alternatives

1. Add a ZIP path directly to the Weebly adapter: minimal initial code but mixes acquisition/security with interpretation and prevents other platforms from reusing local inputs.
2. Feed extracted files through a temporary localhost HTTP server: reuses crawler but adds lifecycle/URL ambiguity and can hide archive-related provenance.
3. **Proposed:** explicit acquisition → snapshot → normalization boundary: modest up-front work, clean separation, reliable replay.

## Consequences / open questions

- Need new tests for URL mapping, relative file and stylesheet paths, missing files, archive bombs, snapshot replay and manifest integration.
- Decide what “source URL” means if no public URL exists; do not fabricate external URLs without provenance. Site schema version/migration may be required.
- Should capture directory contain only normalized data, or also snapshot? Final bundle layout and compatibility require a separate implementation plan.
- Future platform shutdowns can be added by new importers + SourceAdapters.
- Initial version explicitly excludes automatic DNS, hosting, account login and remote deployment.

## Acceptance before changing status to Accepted

- Approve the minimal acquisition interface and snapshot schema.
- Obtain at least one authorized anonymized offline sample and document exact supported format.
- Define archive-security resource limits and error/warning behavior.
- Specify backward compatibility for existing v0.1.0 command outputs and schema.
- Record test plan and release strategy in a focused implementation PR.

Related: ADR-001, ADR-004, ADR-006, ADR-008, ADR-009, ADR-015, ADR-016; docs/CODEX_HANDOFF.md SR-003/SR-004.
