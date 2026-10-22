# Codex / Agent Instructions — Site Rescue

This file defines repository-local expectations for coding agents. Read **docs/PROJECT_STATUS.md**, **docs/CODEX_HANDOFF.md** and **docs/NEXT_STEPS.md** before proposing or implementing a change. The handoff describes confirmed behavior, hypotheses requiring reproduction, priority, acceptance criteria, and the next task.

## Mission and scope

Site Rescue is an **Apache-2.0, local-first, CLI-first, platform-neutral website recovery toolkit**. Preserve site owners' authorized content and produce transparent, verifiable static-site migrations. Weebly is the first platform adapter, not the architecture of the application.

- **Keep:** TypeScript, Node.js, pnpm workspace, versioned content schema, adapter registry, static exporter, bounded crawler, offline verification, SHA-256 rescue bundle, ADRs.
- **Do not introduce by default:** SaaS, login, telemetry, payment, DNS automation, AI-powered rewriting, unauthorized scraping, or automatic production deployment.
- **Do not assume** that a Weebly account data download is a complete site archive. Confirm supported ZIP/folder layouts with authorized, sanitized fixtures.
- Do not overwrite, modify, or delete a user's source website files or imported backup. Generated output must remain separate.

## Start every development session

1. Inspect latest git status, main branch, open PRs and relevant Issues; do not assume the 2026-10-13 snapshot is current.
2. Read README.md, docs/CODEX_HANDOFF.md, docs/adr/README.md, and relevant existing ADRs.
3. Select **one** focused issue from the handoff backlog; explicitly state assumptions and a testable acceptance criterion.
4. Work in a feature branch and propose a PR. **Never push directly to protected main, auto-merge, tag, or publish a release without explicit user approval.**
5. Write a regression test or fixture reproducing a bug before fixing it where feasible.
6. Record what was actually tested; never claim a pass solely from previous release notes.

## Package responsibility boundaries

- apps/cli: commands and orchestration; keep thin.
- packages/core: source-adapter interface and deterministic registry.
- packages/html-inline: shared standard inline DOM interpretation; no fetching or exporting.
- packages/source-inventory: bounded read-only generic folder inspection; no ZIP extraction, normalization or snapshot replay.
- packages/html-directory: generic offline directory acquisition, evidence copies and file/URL mappings; no network, platform normalization or ZIP extraction.
- packages/source-snapshot: strict versioned generic source index validation and bounded metadata reads; no source fetching or normalization.
- packages/url-mapping: shared safe target-path/query file mapping and serialized query identity; no fetching, query equivalence assumptions or deployment routing.
- packages/crawler, packages/http-policy: bounded authorized live HTTP discovery.
- packages/adapters/weebly and generic-html: source-specific detection and interpretation.
- packages/content-schema: versioned, runtime-validated platform-neutral intermediate representation.
- packages/asset-pipeline, css-references: acquisition and asset dependency rewriting.
- packages/exporters/static-html: transformation from normalized site, **not** source fetches.
- packages/report: precise migration warnings, coverage and manual-review evidence.
- New reports use Report 2.0.0 with separate acquisition/conversion/static/manual dimensions; keep the frozen Report 1.0.0 reader/renderer behavior for saved bundles. A stored checksum is metadata, not a completed verification. Never infer acquisition counts from free-form messages or clear unknown completeness/manual review because static checks pass.
- packages/static-verifier, rescue-manifest: file/link integrity and portable-bundle checks.
- packages/output-safety: existing-path protections.
- Other source-input, archive importer and live snapshot contracts remain proposals. Avoid changing the source adapter contract or saved schema without an ADR and backwards-compatibility plan.

## Verification (from repository root)

    pnpm install --frozen-lockfile
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm build
    pnpm release:check

When relevant, also smoke-test the bundled CLI with --help, --version and an **offline** fixture. Test extraction/path traversal and zip-bomb limits for any importer. Tests and CI should not require fetching public websites.

## Non-negotiable safety and quality

- Never put customer content, credentials, session cookies, private URLs, real production logs, or proprietary archives into fixtures or Issues. Use synthetic or authorized redacted test data.
- Do not silently drop content, links, pages or files. Preserve source evidence where possible; otherwise emit actionable warnings and mark review required.
- Treat “static links resolve” and “SHA-256 matches” as integrity checks, **not proof of complete migration or visual/functional parity**.
- Preserve immutable input/source snapshots when added. Reject archive traversal, symlinks outside root, decompression bombs and unexpected special files.
- Keep outputs deterministic and avoid destructive overwrite.
- Treat source websites and archives as untrusted; avoid executing source JavaScript, HTML or active content in the CLI or preview.
- Use project licenses/notices correctly. Review dependencies and the license policy before adding new libraries.
- Make CLI and docs usable in English, with Traditional Chinese user guidance where it helps.

## Planning documents

- docs/CODEX_HANDOFF.md — current-state review and ordered work.
- docs/adr/ADR-020-source-acquisition-and-offline-import.md — **Proposed**, not accepted.
- docs/adr/ADR-021-rich-content-and-migration-coverage.md — **Proposed**, not accepted.
- docs/INTEGRATION_PROGRESS.md — implemented scope, previous validation evidence, and remaining integration gates.
- docs/adr/ADR-022-versioned-inline-content.md — **Proposed**, focused SR-002 implementation.
- docs/adr/ADR-023-read-only-html-directory-inventory.md — **Proposed**, user-approved generic Inventory phase only.


## Current continuation (2026-10-22)

The user requested transferring the current plan into the repository for Codex to continue. This branch is based on complete candidate PR #34 (de0b991), which includes unmerged #30–#33. Main already includes #29. Published v0.1.0 remains unchanged. See PROJECT_STATUS.md for exact scope and historical CI evidence; this documentation update does not implement SR-008 or start another Codex session.

Follow NEXT_STEPS.md: finish the remaining Stage A integration review, then implement the focused Stage B terminal wizard on a feature branch using existing core orchestration. Do not repeat completed SR-001–007 scoped implementations or apply obsolete handoff starters.

Generic folder import and offline Snapshot/replay do not require a real Weebly sample. Official format validation, ZIP and Live URL Snapshot are separate scopes. Retain Report2 review-required semantics, frozen legacy Report1 validation, query mapping compatibility, Node24.22.0/engines >=24.22.0 <25 and the existing aggregate Quality checks gate.

All merge/tag/release boundaries above remain in force. Closing existing PRs is not part of this handoff. Do not force-push or discard local work. Historical stage narrative is retained in INTEGRATION_PROGRESS.md and Git history; current status and NEXT_STEPS.md take precedence over old starter prompts.
