# ADR-014: Preserve same-origin redirect aliases for deployment handoff

- Status: Accepted
- Date: 2026-08-21

## Context

The normalized schema has supported redirects from the beginning, but source adapters always emitted an empty list. The crawler already retains both the requested URL and final response URL after followed redirects, so same-origin aliases can be preserved without browser automation or platform-specific parsing. Losing those aliases would leave old inbound links broken after migration.

## Decision

The crawler records a platform-neutral redirect evidence pair whenever a requested same-origin URL resolves to a different same-origin final URL. Final HTML documents are normalized only once even when several aliases reach the same page. Cross-origin redirects remain rejected by the crawler.

A dedicated redirects package maps crawler evidence to normalized site paths after the source adapter has produced pages. The final page source URL determines its normalized target path. Query-bearing evidence, missing targets, page collisions, and conflicting mappings are skipped with explicit migration warnings. Redirects created for a site migration use status 301 as the intended permanent destination behavior; this is a migration policy and does not claim to reproduce the source server's original redirect status or intermediate chain.

The static exporter writes a deterministic `redirects.json` handoff manifest and one HTML fallback page per redirect. The fallback contains a canonical link, immediate meta refresh, and clickable link. It improves compatibility on basic static hosting but is not equivalent to an HTTP 301. Migration reports therefore require manual review until the manifest is configured in the production host.

## Consequences

- Old same-origin path aliases remain visible and actionable after capture.
- Redirect handling stays platform-neutral and does not change adapter-specific parsing.
- Generated fallback pages are offline-verifiable and cannot overwrite normalized pages or assets.
- Production hosting still needs an explicit redirect configuration step.
- DNS automation, host-specific configuration, cross-origin migration, query rules, JavaScript redirects, and exact source redirect-chain reproduction remain outside this phase.
