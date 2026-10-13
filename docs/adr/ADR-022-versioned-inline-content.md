# ADR-022: Version inline content without invalidating legacy captures

- Status: Proposed — implemented for review in the SR-002 draft PR
- Date: 2026-10-13
- Scope: SR-002 only; the broader coverage proposal in ADR-021 remains separate.

## Problem

Paragraphs and list items currently retain only plain strings. Both adapters discard inline links, emphasis, code, and line breaks before export. Adding fields under schema 1.0.0 would let old readers silently strip those fields and lose content again.

## Decision proposed by this implementation

- New captures use site schema **1.1.0**. Updated readers accept **1.0.0 and 1.1.0**, preserve the input version, and reject other versions. Package/release and migration report versions do not change.
- Keep `paragraph.text`, `heading.text`, and `list.items` as plain-text fallbacks. Add optional `inlines` to paragraphs/headings and `itemInlines` to lists. A list's inline arrays must align with its plain items. These fields are forbidden in a document claiming schema 1.0.0.
- Inline nodes represent text, links, strong emphasis, emphasis, code, line breaks, and spans for named anchors. Safe source IDs are retained on supported text blocks and inline elements. No source HTML, scripts, attributes, or CSS are executed.
- A small shared `html-inline` utility parses standard inline HTML for both adapters. It does not fetch, detect platforms, or export. The schema validates neutral nodes; the static exporter renders them and rewrites links using known page mappings.
- Allow only HTTP(S), mailto, tel, and relative/fragment inline link targets. Resolve source-relative links against their actual source page. Invalid/unsafe links become readable content with an actionable warning; unsupported inline semantics also require review. Serialized unsafe links are rejected, and the exporter validates link schemes defensively.
- Keep semantic whitespace, escape all text and attributes, preserve code text, and bound inline nesting. Inline link fragments must resolve against preserved source IDs and existing static verification.
- Rescue manifests record the **actual capture schema version**, accept both supported versions, and require their schema version to match the capture.

## Compatibility and limitations

Old 1.0.0 documents require no conversion: missing inline fields render through the existing plain-string path. New 1.1.0 documents cannot be read by older tools, which reject the version rather than flattening them. Old lost content cannot be reconstructed without recapturing source HTML. An automatic downgrade is intentionally absent because it would discard inline semantics.

This does not implement arbitrary DOM round trips, nested list layout, source CSS semantics, inline media positioning, rich image captions, offline import, source snapshots, or a completeness model. Unsupported semantics must be reported, not silently certified as preserved. The source adapter contract remains unchanged.

## Evidence required for acceptance

Offline synthetic fixtures must exercise both adapters, paragraphs/lists, nested formatting, Chinese UTF-8, escaped text, line breaks, relative/internal/external links, fragment targets, unsafe input, saved JSON validation, static verification, rescue manifests, and legacy 1.0.0 input. Record the failing regression before the fix and all five repository checks plus packaged CLI smoke results in the PR.

Related: ADR-004, ADR-008, Proposed ADR-021; docs/CODEX_HANDOFF.md SR-002.
