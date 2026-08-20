# ADR-013: Apply rescued source stylesheets only through an explicit export mode

- Status: Accepted
- Date: 2026-08-20

## Context

Phase 12 preserves top-level source stylesheets and their recursive dependencies, but normalized static pages intentionally load only the Site Rescue baseline stylesheet. Applying source CSS can improve visual familiarity, yet source selectors may depend on platform-specific markup that the normalized exporter does not reproduce. Enabling those styles by default could therefore make otherwise readable exports unusable.

## Decision

Add a static export style mode with two values: `baseline` and `source`. The default remains `baseline`, preserving existing output behavior. The `source` mode is explicitly selected through `site-rescue export` or `site-rescue rescue` with `--style-mode source`.

Source mode always loads the Site Rescue baseline first and then links each locally downloaded, checksummed top-level source stylesheet in deterministic capture order. CSS assets marked as dependencies are copied and verified but are not linked directly because their parent stylesheets already reference them. Captures created before stylesheet roles were introduced may identify a top-level stylesheet through the `text/css` media type or a `.css` source URL.

Source mode fails with an actionable error when no source stylesheet exists or when any selected source stylesheet lacks a local path or checksum. It never inserts a remote stylesheet URL into generated HTML. Users can return to the safe output by exporting the same capture again in the default baseline mode.

## Consequences

- Existing commands and captures continue to produce baseline-only pages unless source mode is requested.
- Source CSS can be reviewed through the existing offline verifier and loopback preview workflow.
- Applying source CSS remains reversible and does not change the normalized content schema.
- Source styles may have limited effect or conflict with normalized markup; visual parity is not claimed.
- CSS sanitization, selector translation, theme editing, visual comparison, JavaScript, and an interactive style toggle remain outside this phase.
