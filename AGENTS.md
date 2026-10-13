# Codex / Agent Instructions — Site Rescue

This file defines repository-local expectations for coding agents. Read **docs/CODEX_HANDOFF.md** before proposing or implementing a change. The handoff describes confirmed behavior, hypotheses requiring reproduction, priority, acceptance criteria, and the next task.

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
- packages/crawler, packages/http-policy: bounded authorized live HTTP discovery.
- packages/adapters/weebly and generic-html: source-specific detection and interpretation.
- packages/content-schema: versioned, runtime-validated platform-neutral intermediate representation.
- packages/asset-pipeline, css-references: acquisition and asset dependency rewriting.
- packages/exporters/static-html: transformation from normalized site, **not** source fetches.
- packages/report: precise migration warnings, coverage and manual-review evidence.
- packages/static-verifier, rescue-manifest: file/link integrity and portable-bundle checks.
- packages/output-safety: existing-path protections.
- New source-input / offline importer / source-snapshot packages are **proposals**, not existing code. Avoid changing the source adapter contract or saved schema without an ADR and backwards-compatibility plan.

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

In the development integration branch, SR-001 and SR-002 are implemented and SR-003 has only a generic HTML directory Inventory. Read the current progress before selecting new work; the original SR-001 starter prompt in the historical handoff is not a new task. Full SR-003 import still requires an authorized sanitized format sample. The user approved generic Inventory without that sample, not official Weebly support. Do not start another roadmap item or merge/publish merely because this integration is ready for review.
