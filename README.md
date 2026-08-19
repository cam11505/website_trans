# Site Rescue

[![CI](https://github.com/cam11505/website_trans/actions/workflows/ci.yml/badge.svg)](https://github.com/cam11505/website_trans/actions/workflows/ci.yml)

Site Rescue is a platform-neutral, CLI-first, local-first toolkit for rescuing websites from hosted platforms that are shutting down or becoming inaccessible. Weebly is the first source adapter; it is not the architecture of the product.

> Phase 10 adds a conservative Generic HTML fallback adapter, proving the platform extension boundary with a second production implementation.

## Current capabilities

- Versioned normalized content schema with runtime validation
- Platform-neutral source-adapter contract and deterministic registry selection
- Bounded, deterministic, same-origin HTML crawler
- Weebly detection with confidence and human-readable evidence
- Generic HTML fallback detection and standards-based content normalization
- `site-rescue diagnose <url>` CLI command
- `site-rescue capture <url>` normalized JSON capture command
- `site-rescue export <site.json>` platform-neutral static HTML export command
- `site-rescue report <site.json>` migration readiness and manual-review report command
- `site-rescue verify <site-directory>` offline static link and asset verification command
- `site-rescue rescue <url>` end-to-end local capture, static export, report, and verification command
- Content-addressed asset downloads with SHA-256 checksums and duplicate-file reuse
- Local path rewriting for normalized image, gallery, and video blocks
- Static pages with local navigation, responsive baseline CSS, and verified asset copies
- Offline fixture tests for schema, crawling, adapter detection, and CLI orchestration

## Requirements

- Node.js 20.19 or newer (the CI baseline is recorded in `.node-version`)
- pnpm 10.34.5 (recorded in `packageManager`)

## Quick start

```bash
pnpm install
pnpm site-rescue diagnose https://example.weebly.com
pnpm site-rescue diagnose https://example.com
pnpm site-rescue rescue https://example.weebly.com --output ./rescued-site
pnpm site-rescue capture https://example.weebly.com --output ./capture
pnpm site-rescue export ./capture/site.json --output ./site
pnpm site-rescue report ./capture/site.json --output ./report
pnpm site-rescue verify ./site
```

The one-step command keeps reusable capture data separate from the generated website:

```text
rescued-site/
├─ capture/
│  ├─ site.json
│  └─ assets/
├─ site/
│  ├─ index.html
│  ├─ assets/
│  └─ ...
└─ report/
   ├─ migration-report.json
   └─ migration-report.md
```

Skip binary asset downloads when only a normalized manifest is needed:

```bash
pnpm site-rescue capture https://example.weebly.com --output ./capture --skip-assets
```

Limit discovery when testing a large site:

```bash
pnpm site-rescue diagnose https://example.weebly.com --max-pages 20
```

After building, the CLI entry point can also be run directly:

```bash
pnpm build
node apps/cli/dist/index.js diagnose https://example.weebly.com
node apps/cli/dist/index.js rescue https://example.weebly.com --output ./rescued-site
node apps/cli/dist/index.js capture https://example.weebly.com --output ./capture
node apps/cli/dist/index.js export ./capture/site.json --output ./site
node apps/cli/dist/index.js report ./capture/site.json --output ./report
node apps/cli/dist/index.js verify ./site
```

`capture/site.json` contains site metadata, navigation, normalized pages and blocks, an asset manifest, redirects, and warnings. Successfully downloaded files are stored under `capture/assets/`; each manifest entry retains its original `sourceUrl` and adds `localPath`, `mediaType`, and a SHA-256 `checksum`. Failed downloads remain as source URLs and produce `asset-download-failed` warnings without aborting the rest of the capture.

Example output:

```text
Site Rescue diagnosis
URL: https://example.weebly.com/
Platform: Weebly (100% confidence)
  evidence: Hostname is on weebly.com
  evidence: Generator metadata names Weebly
Discovered pages (3):
  - /
  - /about.html
  - /contact.html
```

## Repository layout

```text
site-rescue/
├─ apps/
│  └─ cli/                    # Thin command-line application
├─ packages/
│  ├─ content-schema/         # Platform-neutral normalized site model
│  ├─ core/                   # Source-adapter contracts and registry selection
│  ├─ crawler/                # Bounded same-origin page discovery
│  ├─ asset-pipeline/          # Downloading, hashing, deduplication, and path rewriting
│  ├─ report/                  # Platform-neutral migration analysis and reports
│  ├─ static-verifier/         # Offline generated-site integrity checks
│  ├─ exporters/
│  │  └─ static-html/          # Platform-neutral static website generation
│  └─ adapters/
│     ├─ generic-html/        # Conservative standards-based fallback adapter
│     └─ weebly/              # Weebly-only detection rules
├─ fixtures/
│  └─ weebly/                 # Sanitized, deterministic test pages
└─ docs/
   └─ adr/                    # ADR-001 through ADR-008
```

The intended long-term boundary is:

```text
source website -> source adapter -> normalized site schema -> exporter -> target website
```

## Development checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

GitHub Actions runs these checks plus a built-CLI smoke test on every pull request and every push to `main`. The workflow uses a frozen lockfile, pinned action commits, read-only repository permissions, and a 10-minute job timeout.

Default tests do not access live websites. Live compatibility checks should remain separate and explicit.

## Crawl behavior and limitations

- Crawls only HTTP(S) links on the exact origin of the starting page.
- Removes URL fragments and ignores common non-document extensions.
- Fetches HTML only, follows links breadth-first, and stops at 50 pages by default.
- Does not execute JavaScript, sign in, bypass access controls, or process private content.
- Client-rendered pages and interaction-only navigation may be missed.

Only crawl and migrate websites you own or are authorized to process. Review the source site's terms and applicable policies before running the tool.

## Generic HTML fallback behavior

- Runs after platform-specific adapters with intentionally low detection confidence.
- Extracts server-rendered metadata, navigation, common content blocks, and referenced assets.
- Preserves forms, tables, and objects as inert source for manual review.
- Adds a `generic-html-fallback` warning to every capture, so reports never claim automatic readiness.
- Does not execute JavaScript or recover client-rendered state, application behavior, or platform-specific features.

## Asset behavior and limitations

- Downloads HTTP(S) assets already discovered by the source adapter, including images, video sources, posters, and linked stylesheets.
- Stores assets using content-derived filenames and reuses one file when multiple URLs return identical bytes.
- Limits each asset to 50 MiB by default and records individual failures as warnings.
- Does not execute downloaded content.
- Does not yet recursively download resources referenced from inside CSS files.

## Static export behavior and limitations

- Consumes only a validated `site.json` and its local assets; it does not call the crawler or Weebly adapter.
- Writes one HTML file per normalized page and rewrites known internal page and asset references as relative links.
- Copies local assets only after validating their recorded SHA-256 checksums.
- Escapes text content and displays preserved embed or raw HTML as inert source instead of executing it.
- Adds a small responsive baseline stylesheet; it does not reproduce the original platform theme pixel-for-pixel.

## Migration report behavior

- Consumes only a validated `site.json`; it does not call the crawler or a source adapter.
- Writes deterministic `migration-report.json` and `migration-report.md` artifacts.
- Summarizes pages, nested content blocks, verified, unverified, and remote assets, warnings, and manual-review items.
- Marks a capture as `review-required` when warnings, remote assets, preserved embeds, or raw HTML remain.
- The report is guidance for migration review; it does not claim visual or functional parity with the source site.

## Static verification behavior

- Scans generated HTML files and validates local `href`, `src`, and `poster` references.
- Checks page fragments against HTML `id` and legacy anchor `name` values.
- Rejects unsafe URL schemes, invalid encodings, paths outside the site root, and unverified symbolic-link targets.
- Counts external references but never requests them over the network.
- Returns exit code `2` when broken local references are found, making the command suitable for CI.
- A successful verification proves local file integrity, not migration completeness or external-link availability.

## Explicitly out of scope for phase 10

- GUI or hosted SaaS
- Cloudflare infrastructure or domain automation
- Payments, CMS, page builder, membership, or e-commerce
- Pixel-perfect cloning or AI redesign
- Astro or framework-specific exporters
- Automatic deployment or hosting
- JavaScript rendering, browser automation, authenticated crawling, or form behavior recreation

## Decisions

See [Architecture Decision Records](./docs/adr/README.md) for ADR-001 through ADR-010.

## License

No license has been selected yet. Choose and add an open-source license before public distribution.
