# ADR-012: Recursively rescue and verify CSS dependencies

- Status: Accepted
- Date: 2026-08-20

## Context

Source adapters already identify linked stylesheets, but the asset pipeline previously stored each CSS file as opaque bytes. Resources referenced through `@import` and `url()`, including fonts and background images, therefore remained dependent on the source website and were invisible to offline verification.

## Decision

Introduce a platform-neutral CSS reference package based on an AST parser. Both the asset pipeline and static verifier use the same reference semantics instead of maintaining separate regular-expression implementations.

Adapters mark top-level stylesheets with an optional asset role. This is a backward-compatible schema addition; captures without roles continue to recognize CSS through media type and file extension. Dependencies discovered from CSS receive a deterministic ID and the `dependency` role.

The asset pipeline processes CSS in two phases. It first discovers and downloads dependencies, then assigns local paths and rewrites references. Binary assets remain content-addressed and deduplicated. Rewritten stylesheets use a stable source-URL hash path under `assets/css/`, allowing circular imports to be rewritten without a content-hash cycle; their manifest checksum always describes the final rewritten bytes.

Discovery is bounded to five stylesheet-import levels and 500 derived assets by default. Existing per-file size and timeout limits remain in force. Failed dependencies remain remote references and produce warnings rather than aborting unrelated downloads.

The static verifier scans every CSS file in addition to HTML and validates local references without network access.

## Consequences

- Captures preserve fonts, images, and nested stylesheets needed by downloaded CSS.
- Circular imports and duplicate URLs do not cause unbounded downloads.
- CSS parse, depth, dependency, and download failures remain visible in migration reports.
- Source stylesheets are preserved and verified but are not automatically applied to normalized static pages.
- Inline styles, JavaScript-loaded CSS, visual parity analysis, and CSS optimization remain outside this phase.
