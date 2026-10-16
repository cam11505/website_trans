# ADR-027: Stable exact-query static paths and redirect handoff

- Status: Proposed — implemented for review in SR-006
- Date: 2026-10-16
- Scope: observed query-bearing HTML pages/redirects, on unchanged PR #32

## Context

Both adapters retain ordinary query strings in targetPath, but the exporter strips them when selecting files. Different pages such as `/page.html?id=1` and `?id=2` collide and cannot be exported together. Redirect evidence rejects all queries, and the exporter and redirect mapper duplicate route-to-file logic. The user requested the next roadmap step after evidence-based reporting. Preserve the current architecture and non-query file paths while making query support explicit and collision-safe.

## Decision

Introduce a small shared `url-mapping` package used by both adapters, redirect planning and static export. A target resource with a query (including a bare `?`) maps to `__site-rescue-query/<sha256>.html`; the digest input is the UTF-8 serialized target pathname plus exact query, excluding fragment. No query parameter name/value is a filesystem segment. Pathname traversal/encoded separator validation runs before hashing. Query values are opaque data, not filesystem references. Non-query routes keep their current index/extension mapping. Hash collisions and source/output/reserved artifact conflicts still reject; no file overwrite or automatic renaming of conflicting user routes.

Adapters preserve URL-serialized parameter order, duplicates, empty values and empty query markers. Nothing sorts parameters, decodes/re-encodes them, discards tracking keys, equates `+` with `%20` or merges percent-escape spellings. This can preserve identical-content variants as separate pages; content deduplication and server-specific query equivalence are not assumed. Existing saved Site 1.0.0/1.1.0 captures with retained queries can be exported without a schema migration. Old captures that lost a bare marker cannot recover it automatically; conflicting target paths still fail safely.

Link matching uses exact normalized HTTP(S) source URLs including query and without fragment. Known page and redirect aliases map to the corresponding final local file, preserving the fragment for the actual target page. Unknown same-origin query references retain their original URLs, never the first known variant. The exporter returns a deduplicated (page, reference) unresolved count, and CLI export prints a warning. No reference is fetched and no source script runs.

When a captured source base URL has a query and no output already claims `index.html`, emit one inert static entry fallback to its mapped page (or captured redirect destination). Record it separately; it is not a captured page or invented source HTTP redirect. Existing home output always wins. Preview serves the generated filenames normally; it does not interpret original query routing or configure hosting.

## Output-only mapping contract

Exports involving a query-bearing page/source or redirect add **`url-mapping.json` 1.0.0**, reserved before writes. It records the exact-query policy/algorithm, source URL/sourcePath/targetPath/outputFile for all captured pages, original redirect paths/status and their output/target files, optional generated entry point, and unresolved same-origin query links encountered during rendering. Lists are canonically sorted; file naming depends on the target resource, not enumeration order. The map contains original URLs/query values for traceability and review before publishing. It is not accepted as an input to acquisition, parser replay, preview routing or filesystem reads.

If an export has no query-bearing pages or redirects, no extra mapping file is emitted; uncaptured query references are still retained and reported by the CLI result/warning. The map reports known mappings, not discovery completeness or dynamic query-service coverage. Existing Report2 keeps source completeness unknown and manual review required. Generic folder import/replay retains its documented file-only query collapse and review warnings; it does not fabricate per-query files absent from the folder.

## Redirect compatibility

The Site redirect shape stays unchanged. Observed same-origin query aliases may now target captured query/non-query pages; matching/conflict handling shares the same output mapping as export. Missing/cross-origin/conflicting targets continue to produce explicit warnings. Fragment-conditioned server redirect rules remain unsupported; URL fragments are not HTTP resource identity.

For query-bearing rules, `redirects.json` uses **2.0.0**, with original redirect paths/status, `queryMatching: "exact-serialized-path-and-query"` and `staticFallbacks` recording output/target files. This is deployment handoff evidence for only the observed exact query routes, not general conditional routing. A production host must implement exact matching; no automatic host/DNS deployment is added. HTML fallbacks are not equivalent to HTTP301. Non-query-only redirect manifests keep 1.0.0 and their existing shape. Older deployment tooling must reject the new version rather than treat it as a pathname-only rule set.

## Compatibility and limits

Site, Snapshot, Report2, acquisition evidence and rescue manifest versions remain unchanged. Bundle hashing already includes new files under site/. The old Report1 reader remains frozen. Package/release versions stay unchanged and no new third-party dependency is added. Query variants remain subject to crawler page limits and truncation warnings; query matching does not discover pages or execute scripts/search services. Shared files/links can pass static verification without proving source, visual or functional equivalence. The new main-base Draft PR includes unchanged #30/#31/#32 dependencies for exact-head CI/CodeQL; no merge/tag/release is authorized.

## Validation

Regression first: different queries must export distinctly; stable filenames independent of enumeration; parameter-order/duplicates/empty-marker/encoding identity preserved; same-origin query redirects and local alias/fragment links agree; query-only entry point remains usable; unknown queries stay distinct; unsafe pathnames cannot bypass validation via hashing; reserved/output collisions and existing output still reject. Exercise both adapters, captured and synthetic input Sites, new and legacy redirect manifests, actual bundled CLI with network guards and whole-bundle verification. Run all five checks, audit and exact-head Linux CI/CodeQL.
