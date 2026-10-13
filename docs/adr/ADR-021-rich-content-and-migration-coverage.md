# ADR-021: Preserve rich inline content and distinguish migration coverage from integrity

- **Status: Proposed — not accepted**
- **Date: 2026-10-13**
- **Context at the v0.1.0 baseline:** Schema v1.0.0 models paragraph.text and list.items as plain strings. Weebly/Generic HTML adapters commonly call .text() and the static exporter HTML-escapes the resulting string. Inline links, emphasis, inline code and line breaks can be lost. Separately, static-verifier validates generated references but cannot establish whether every original page and content element was acquired.

The development integration implements the focused inline representation and 1.0.0/1.1.0 compatibility in [ADR-022](./ADR-022-versioned-inline-content.md). It also fixes truncation readiness in SR-001. The broader coverage model below remains Proposed and is not implemented; see [current progress](../INTEGRATION_PROGRESS.md).

## Decision proposal A — rich inline content

Define a **platform-neutral inline text tree** usable by paragraph and list items. Candidate nodes:

- text(value)
- link(href, children)
- strong(children)
- emphasis(children)
- code(value)
- lineBreak

Convert nested semantic HTML into the tree without preserving executable markup; render with escaped text and validated links. Retain block layout as already modeled. The exact types are undecided; choose the smallest interoperable set needed by real sanitized fixtures.

**Original versioning constraint:** The v0.1.0 baseline used CURRENT_SCHEMA_VERSION 1.0.0 and accepted that exact version. Do not change the stored meaning of existing files silently. The focused implementation now emits 1.1.0 and reads both 1.0.0/1.1.0 as specified by ADR-022; broader future changes still require explicit compatibility and versioning decisions.

## Decision proposal B — truthful migration readiness

Distinguish:
1. **Source acquisition coverage:** number of fetched vs discovered/known pages; truncation; fetch failures; source completeness unknown.
2. **Normalization / semantic preservation:** warnings about unsupported widgets, dropped/flattened markup, unresolved internal links, lost metadata.
3. **Generated static integrity:** whether local HTML/CSS/asset references and recorded hashes verify.
4. **Manual deployment review:** real redirects, forms, accounts, e-commerce, JS behavior, visual/layout differences, external dependencies.

Never equate static-verifier valid=true with a complete migration. A partial/truncated crawl must emit an actionable warning and never result in an unqualified "ready" label. Document precisely what readiness means. Avoid backwards-incompatible report shape changes without an explicit version policy.

## Examples requiring tests

- Original: a paragraph mixing normal text and a relative link; exported link must navigate locally if the target page exists.
- Nested strong/em and inline code; output retains semantic structure.
- List item containing a link; not converted into plain text.
- Escaped text and untrusted URLs cannot generate unsafe active HTML.
- A multi-page fixture using maxPages=1; report indicates truncated/discovery incomplete and review-required.
- An incomplete source archive; report must identify unavailable content rather than certify equivalence.
- Existing v0.1.0 site.json continues to be understood through documented migration/compatibility mechanism.

## Non-goals

- Pixel-perfect visual parity, full HTML DOM round-trip, unrestricted raw HTML execution.
- Interactive form, membership, store, or script behavior recreation.
- Hosted SaaS or AI rewriting.

## Risks / questions before acceptance

- What inline nodes are truly needed for Weebly and generic HTML? Fixtures should drive the minimal model.
- How to represent unsupported content with source spans/provenance for later repair?
- Will new report enums/fields force consumers to update? Define compatibility contract.
- How to preserve anchors, fragments, internal/external URL intent and safe link rewriting?
- Should Rich Text and coverage reporting ship in one release or separately? They may be separate PRs even if tracked in one ADR.

## Acceptance before changing status to Accepted

- Provide fixture-based loss examples and unit tests with expected normalized and HTML export output.
- Decide schema change/version migration and report compatibility.
- Define warning codes and "review-required" logic, especially crawl truncation.
- Approve API boundaries: adapters parse; content-schema validates; exporter renders; report aggregates evidence.

Related: ADR-001, ADR-004, ADR-008, ADR-014, ADR-015; docs/CODEX_HANDOFF.md SR-001/SR-002/SR-005.
