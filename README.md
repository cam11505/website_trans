# Site Rescue

[![CI](https://github.com/cam11505/website_trans/actions/workflows/ci.yml/badge.svg)](https://github.com/cam11505/website_trans/actions/workflows/ci.yml)

Site Rescue is a platform-neutral, CLI-first, local-first toolkit for rescuing websites from hosted platforms that are shutting down or becoming inaccessible. Weebly is the first source adapter; it is not the architecture of the product.

> Site Rescue `v0.1.0` is the first public release and is licensed under Apache-2.0.

> The development integration tracked in [PR #29](https://github.com/cam11505/website_trans/pull/29) includes SR-001, SR-002, the SR-003 generic HTML directory Inventory phase and dependency security fixes. These additions are unreleased; see [integration progress and remaining limits](./docs/INTEGRATION_PROGRESS.md). The published v0.1.0 bundle remains unchanged.

## Current capabilities

- Versioned normalized content schema with runtime validation
- Platform-neutral source-adapter contract and deterministic registry selection
- Bounded, deterministic, same-origin HTML crawler
- Shared bounded HTTP retry, timeout, and response-body policy for HTML and assets
- Fresh-output-only lifecycle for capture, export, report, and end-to-end rescue commands
- Self-contained Node.js CLI release package with SHA-256 inventory and smoke verification
- Apache-2.0 project licensing with bundled third-party license and NOTICE preservation
- `site-rescue --version` release-version command
- Weebly detection with confidence and human-readable evidence
- Generic HTML fallback detection and standards-based content normalization
- `site-rescue diagnose <url>` CLI command
- `site-rescue capture <url>` normalized JSON capture command
- `site-rescue export <site.json>` platform-neutral static HTML export command
- `site-rescue report <site.json>` migration readiness and manual-review report command
- `site-rescue verify <site-directory>` offline static link and asset verification command
- `site-rescue inspect-source <html-directory>` bounded, read-only offline file inventory (no import or ZIP support)
- `site-rescue import-source <html-directory>` offline generic HTML folder acquisition, static export, report, verification and evidence bundle (development feature)
- `site-rescue replay-source <snapshot-directory>` verify raw source files and reparse offline with the current generic adapter (development feature)
- `site-rescue manifest <rescue-directory>` deterministic whole-bundle SHA-256 manifest command
- `site-rescue verify-bundle <rescue-directory>` offline rescue bundle integrity command
- `site-rescue preview <site-directory>` verified local HTTP preview command
- `site-rescue rescue <url>` end-to-end local capture, static export, report, verification, and bundle manifest command
- Content-addressed asset downloads with SHA-256 checksums and duplicate-file reuse
- Bounded CSS `@import` and `url()` dependency discovery with local reference rewriting
- Local path rewriting for normalized image, gallery, and video blocks
- Semantic inline links, strong/emphasis, literal code, line breaks, and named anchors in paragraphs, headings, and list items
- Static pages with local navigation, responsive baseline CSS, and verified asset copies
- Explicit `baseline` or `source` static export style modes with safe baseline fallback
- Same-origin redirect preservation with normalized 301 mappings and duplicate-page prevention
- Deterministic `redirects.json` handoff manifests and offline-verifiable HTML fallback pages
- Deterministic `rescue-manifest.json` inventories for capture, site, and report artifacts
- Offline fixture tests for schema, crawling, adapter detection, and CLI orchestration

## Requirements

- Node.js 20.19 or newer (the CI baseline is recorded in `.node-version`)
- pnpm 10.34.5 (recorded in `packageManager`)

## Release package

Download `site-rescue-v0.1.0.zip` and `site-rescue-v0.1.0.zip.sha256` from the [`v0.1.0` GitHub Release](https://github.com/cam11505/website_trans/releases/tag/v0.1.0). The archive contains a bundled CLI and does not require pnpm or a dependency installation, but it still requires Node.js 20.19 or newer.

Verify and extract on PowerShell:

```powershell
Get-FileHash .\site-rescue-v0.1.0.zip -Algorithm SHA256
Get-Content .\site-rescue-v0.1.0.zip.sha256
Expand-Archive .\site-rescue-v0.1.0.zip
node .\site-rescue-v0.1.0\bin\site-rescue.js --version
node .\site-rescue-v0.1.0\bin\site-rescue.js --help
```

Verify and extract on macOS or Linux:

```bash
shasum -a 256 -c site-rescue-v0.1.0.zip.sha256
unzip site-rescue-v0.1.0.zip
node site-rescue-v0.1.0/bin/site-rescue.js --version
node site-rescue-v0.1.0/bin/site-rescue.js --help
```

The source archive generated automatically by GitHub is not the bundled CLI release package.

## Quick start

```bash
pnpm install
pnpm site-rescue --version
pnpm site-rescue diagnose https://example.weebly.com
pnpm site-rescue diagnose https://example.com
pnpm site-rescue rescue https://example.weebly.com --output ./rescued-site
pnpm site-rescue rescue https://example.weebly.com --output ./styled-rescue --style-mode source
pnpm site-rescue capture https://example.weebly.com --output ./capture
pnpm site-rescue export ./capture/site.json --output ./site
pnpm site-rescue export ./capture/site.json --output ./styled-site --style-mode source
pnpm site-rescue report ./capture/site.json --output ./report
pnpm site-rescue verify ./site
pnpm site-rescue inspect-source ./html-backup --output ./source-inventory
pnpm site-rescue import-source ./html-backup --output ./offline-rescue
pnpm site-rescue replay-source ./offline-rescue/capture/source --output ./replayed-rescue
pnpm site-rescue manifest ./rescued-site
pnpm site-rescue verify-bundle ./rescued-site
pnpm site-rescue preview ./site
```

The one-step command keeps reusable capture data separate from the generated website:

```text
rescued-site/
├─ rescue-manifest.json
├─ capture/
│  ├─ site.json
│  └─ assets/
├─ site/
│  ├─ index.html
│  ├─ redirects.json
│  ├─ assets/
│  └─ ...
└─ report/
   ├─ migration-report.json
   └─ migration-report.md
```

Skip binary asset downloads when only a normalized capture document is needed:

```bash
pnpm site-rescue capture https://example.weebly.com --output ./capture --skip-assets
```

Limit discovery when testing a large site:

```bash
pnpm site-rescue diagnose https://example.weebly.com --max-pages 20
```

Tune bounded request reliability when a source server is slow or unstable:

```bash
pnpm site-rescue diagnose https://example.weebly.com --max-retries 3 --request-timeout-ms 20000 --max-html-bytes 8388608
```

`capture`, `export`, `report`, `rescue`, `inspect-source`, `import-source` and `replay-source` require a new output directory. If the path already exists, the command stops before changing it. A fatal run removes only the new directory created for that run; import/replay static-verification failures retain output for review and return exit 2.

### Offline HTML folder import (development feature)

```bash
pnpm site-rescue import-source ./html-backup --output ./offline-rescue
pnpm site-rescue import-source ./html-backup --output ./offline-styled --style-mode source
pnpm site-rescue verify-bundle ./offline-rescue
```

繁體中文：直接選擇含根目錄 `index.html` 或 `index.htm` 的 HTML 資料夾，即可離線轉換與輸出，不需要原站連線或真實 Weebly 樣本。請選來源以外的新輸出資料夾，匯入期間停止修改來源。先檢查報告與預覽結果；檢查通過不代表版面、互動功能及所有原站內容都已完整移轉。

The generic importer accepts portable regular-file folders with UTF-8 HTML/CSS and a root index. It imports all HTML pages, including unlinked pages, and maps common local images/media, linked attachments and recursive CSS dependencies. Original bytes and hashes are saved under `capture/source/`; `capture/import-source.json` records per-page mappings, the home page and provenance. `site/`, `report/` and `rescue-manifest.json` use the existing output contracts. Saved captures can be re-exported without the selected source directory.

The synthetic `https://site-rescue.invalid/` namespace resolves adapter URLs locally and is explicitly recorded with `publicOrigin: null`; it is never fetched or claimed as the original domain. Simple ASCII source page paths are retained; URL-sensitive/non-ASCII page paths use deterministic `offline-pages/<path-hash>.html` outputs. Directory index links are resolved against the file inventory; query-bearing references use the disk file with review warnings, not separate query-generated pages. `index.htm` home pages export as `index.html`.

No network or source scripts run during import. Missing/external references, unsupported markup and dynamic behavior produce warnings; browsing generated output may still request unresolved external resources. Every import remains `review-required`. Exit 0 means the supported static checks passed, exit 2 retains output with static verification problems and no bundle manifest, and exit 1 means a fatal format/safety/resource error. Existing output and original inputs are preserved.

Limits and override flags match `inspect-source` below. Symlinks/junctions, unsafe names, source/output overlap and detected concurrent changes are rejected. Uninspectable HTML/CSS and `<base href>` stop import with a repair message. ZIP extraction, official Weebly backup-format certification, arbitrary DOM/layout parity and source-parser replay are not included. These limits no longer block generic folder development. See [ADR-024](./docs/adr/ADR-024-generic-offline-html-import.md).

### Source Snapshot and offline replay (development feature)

```bash
pnpm site-rescue import-source ./html-backup --output ./first-rescue
pnpm site-rescue replay-source ./first-rescue/capture/source --output ./replayed-rescue --style-mode source
pnpm site-rescue verify-bundle ./replayed-rescue
```

繁體中文：新匯入會在 `capture/source/source-snapshot.json` 保存原檔清單、SHA-256、來源路徑與原始取得時間。日後即使原始資料夾已移走，也能用 `replay-source` 先核對保存的原檔，再透過目前版本的轉換器重新產生網站與報告；不讀取舊 `site.json`。請指定新的輸出資料夾，原 Snapshot 保持不變。

Source Snapshot **1.0.0** currently supports generic HTML directory acquisition only. All original files must match the recorded set, sizes and hashes; missing, changed or unexpected files fail before adapter normalization. A replay creates a new independent evidence copy, preserving the original acquisition timestamp/index while recording the new normalization timestamp in Site. Outputs always remain `review-required`; they use the existing Site and bundle contracts.

Snapshot metadata is bounded to 4 MiB and uses a strict version/schema. Current CLI Inventory limits apply to source bytes and parsing; stored settings cannot raise them. Symlinks/junctions and overlapping source/output paths (including aliases/ancestors) are rejected. These checks detect common concurrent changes, not atomic isolation: stop source/snapshot writers. Hashes compare bytes with the selected index; they cannot authenticate an index that was altered together with its files. Keep a separately trusted bundle checksum when authenticity matters.

Older SR-003 outputs without this index are not silently upgraded. Re-import their saved `capture/source/files` into a fresh output to create a supported Snapshot. This phase adds no snapshots to live URL capture/rescue, no ZIP extraction, and no promise of identical future parser output. See [ADR-025](./docs/adr/ADR-025-generic-source-snapshot-replay.md).

### Offline source inventory (development feature)

`inspect-source` writes deterministic `source-inventory.json` and `source-inventory.md` containing relative file paths, sizes, SHA-256, common HTML/CSS references, missing files and actionable warnings. It reads source bytes without executing scripts, following symlinks or using the network. Choose an output directory separate from the input and its ancestors, including symlink/junction aliases. Default output is `./site-rescue-inventory`.

```bash
pnpm site-rescue inspect-source ./html-backup --output ./source-inventory
node release/package/bin/site-rescue.js inspect-source ./html-backup --output ./source-inventory
```

The bundled example requires a package built from this source branch; the published v0.1.0 release does not include this command. Every inventory says **review required / migration not assessed**. Exit `0` means the inventory was written, including missing-file warnings; exit `1` means invalid input, a safety/resource failure or output failure. Inventory JSON is not a `site.json` capture and cannot be exported, replayed or verified as a rescue bundle.

| Input | Supported in this phase |
| --- | --- |
| Generic UTF-8 HTML directory | File inventory and common static references; synthetic fixtures only |
| Unsupported encoding or oversized HTML/CSS | Bytes hashed; reference inspection skipped with warnings |
| No HTML / no root index | Layout warnings; no verified backup claim |
| Official Weebly export ZIP / folder layout | Unverified; authorized sanitized real sample still required |
| ZIP / TAR input | Rejected; no extraction |

| Limit option | Default |
| --- | ---: |
| `--max-entries` (files and directories) | 10,000 |
| `--max-depth` (root child = 1) | 16 |
| `--max-file-bytes` | 67,108,864 (64 MiB) |
| `--max-total-bytes` | 268,435,456 (256 MiB) |
| `--max-text-bytes` (per HTML/CSS inspection) | 2,097,152 (2 MiB) |
| `--max-references` | 20,000 |

Overrides require positive safe integers. Hard limits abort before writing an inventory; the text inspection limit records skipped inspection while retaining file hashes. Symlinks/junctions, special files, reserved/non-portable names and NFC/case-folded path collisions are rejected rather than silently omitted.

Local references are checked against inventoried files only: leading `/` maps to the folder root, other paths to the referring file's directory, with exact files and directory `index.html`/`index.htm` fallback. Traversal above root, unsafe schemes, malformed encoding and encoded separators require review. No original public URL or extensionless server route is inferred. External references are recorded without fetching. `<base>`, `srcset`, foreign/template markup, invalid UTF-8, CSS parse failures, query behavior, fragments, JavaScript dependencies and dynamic services require separate review. Other asset formats are hashed without semantic parsing.

Stop source writers before inspection. Metadata/path comparisons detect common concurrent changes but do not provide an atomic snapshot against a hostile writer. SHA-256 records inspected bytes, not source completeness or visual/functional parity. Full SR-003 offline import and SR-004 snapshot/replay remain pending. See [ADR-023](./docs/adr/ADR-023-read-only-html-directory-inventory.md).

After building, the CLI entry point can also be run directly:

```bash
pnpm build
node apps/cli/dist/index.js diagnose https://example.weebly.com
node apps/cli/dist/index.js rescue https://example.weebly.com --output ./rescued-site
node apps/cli/dist/index.js rescue https://example.weebly.com --output ./styled-rescue --style-mode source
node apps/cli/dist/index.js capture https://example.weebly.com --output ./capture
node apps/cli/dist/index.js export ./capture/site.json --output ./site
node apps/cli/dist/index.js export ./capture/site.json --output ./styled-site --style-mode source
node apps/cli/dist/index.js report ./capture/site.json --output ./report
node apps/cli/dist/index.js verify ./site
node apps/cli/dist/index.js manifest ./rescued-site
node apps/cli/dist/index.js verify-bundle ./rescued-site
node apps/cli/dist/index.js preview ./site
```

Prepare and verify the self-contained release candidate package:

```bash
pnpm build
pnpm release:check
node release/package/bin/site-rescue.js --version
node release/package/bin/site-rescue.js --help
```

The generated `release/package` directory is ignored by Git. It contains one bundled CLI entry point, Apache-2.0 project licensing, third-party runtime notices, release metadata and documentation, a source map, and `SHA256SUMS.txt`.

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
│  ├─ html-inline/            # Shared standard inline HTML interpretation
│  ├─ core/                   # Source-adapter contracts and registry selection
│  ├─ http-policy/            # Bounded retry, timeout, and response-body reads
│  ├─ output-safety/          # Fresh-output-only command lifecycle
│  ├─ crawler/                # Bounded same-origin page discovery
│  ├─ css-references/         # Shared CSS AST parsing and reference rewriting
│  ├─ redirects/              # Redirect evidence mapping and conflict handling
│  ├─ asset-pipeline/          # Downloading, hashing, deduplication, and path rewriting
│  ├─ report/                  # Platform-neutral migration analysis and reports
│  ├─ rescue-manifest/         # Whole-bundle inventory and integrity verification
│  ├─ static-verifier/         # Offline generated-site integrity checks
│  ├─ source-inventory/        # Read-only, bounded HTML directory inspection
│  ├─ preview-server/          # Loopback-only static site preview
│  ├─ release-tools/           # Release package build, checksum, and smoke verification
│  ├─ exporters/
│  │  └─ static-html/          # Platform-neutral static website generation
│  └─ adapters/
│     ├─ generic-html/        # Conservative standards-based fallback adapter
│     └─ weebly/              # Weebly-only detection rules
├─ fixtures/
│  └─ weebly/                 # Sanitized, deterministic test pages
└─ docs/
   ├─ RELEASE_CHECKLIST.md    # Exact-commit public release procedure
   └─ adr/                    # ADR-001 through ADR-018
```

The intended long-term boundary is:

```text
source website -> source adapter -> normalized site schema -> exporter -> target website
```

## Development checks

```bash
pnpm lint
pnpm audit:dependencies
pnpm typecheck
pnpm test
pnpm build
pnpm release:check
```

GitHub Actions runs these checks plus built and packaged CLI smoke tests on every pull request and every push to `main`. The workflow uses a frozen lockfile, pinned action commits, read-only repository permissions, and a 10-minute job timeout.

Default tests do not access live websites. Live compatibility checks should remain separate and explicit.

## Crawl behavior and limitations

- Crawls only HTTP(S) links on the exact origin of the starting page.
- Removes URL fragments and ignores common non-document extensions.
- Fetches HTML only, follows links breadth-first, and stops at 50 pages by default.
- If the page limit leaves pending URLs, capture records a `crawl-truncated` warning with the configured limit, captured page count, and discovered URL count. The URL count may include redirect aliases and is not a total page count; additional pages may remain undiscovered. Increase `--max-pages` and recapture into a new output directory.
- Limits each HTML response to 5 MiB and each attempt to 15 seconds by default.
- Retries transient request failures and HTTP 408, 429, 500, 502, 503, and 504 responses twice by default.
- Does not retry permanent HTTP responses such as 404.
- Records same-origin requested-to-final URL aliases and normalizes each final page only once.
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
- Recursively discovers CSS `@import` and `url()` dependencies, including fonts and background images.
- Rewrites successfully downloaded CSS references to local relative paths; failed references remain absolute and produce warnings.
- Stores binary assets using content-derived filenames and reuses one file when multiple URLs return identical bytes.
- Stores rewritten stylesheets under stable source-URL hash paths so circular imports can be resolved safely.
- Limits each asset to 50 MiB by default and records individual failures as warnings.
- Limits each asset request attempt to 30 seconds and uses the shared transient retry policy.
- Limits stylesheet import depth to 5 and CSS-discovered assets to 500 by default.
- Does not execute downloaded content.
- Preserves source stylesheets as migration assets and applies them only when `--style-mode source` is explicitly selected.

## Static export behavior and limitations

- Consumes only a validated `site.json` and its local assets; it does not call the crawler or Weebly adapter.
- Writes one HTML file per normalized page and rewrites known internal page and asset references as relative links.
- Copies local assets only after validating their recorded SHA-256 checksums.
- Escapes text content and displays preserved embed or raw HTML as inert source instead of executing it.
- Renders validated inline trees as semantic HTML and rewrites known page links, including fragments, to local relative references. HTTP(S), mailto, tel, relative and fragment links are supported; unsafe targets are removed with review warnings during capture and rejected in saved inline trees.
- Preserves source IDs on supported text blocks and inline elements, including named anchors. Source code text retains spacing and line breaks; active attributes and source scripts are never rendered.
- Adds a small responsive baseline stylesheet; it does not reproduce the original platform theme pixel-for-pixel.
- Defaults to `--style-mode baseline`; source mode loads the baseline first and then verified top-level source stylesheets.
- Source mode refuses captures with missing or unverified top-level stylesheets instead of linking remote CSS.
- Re-running export in baseline mode provides a deterministic fallback if source CSS conflicts with normalized markup.

## Redirect behavior and limitations

- Converts followed same-origin path aliases into normalized 301 migration mappings.
- Writes a deterministic `redirects.json` manifest for production-host configuration.
- Writes a canonical, meta-refresh, and clickable-link HTML fallback for each non-colliding redirect source path.
- Rejects redirect output collisions and redirects whose targets are not exported pages.
- Treats generated 301 status as migration intent; it does not reproduce the source server's exact status or intermediate chain.
- Skips query-bearing, cross-origin, missing-target, and conflicting redirect evidence with explicit warnings.
- HTML fallback pages do not deliver HTTP 301 responses; configure the manifest in the production host.

## Migration report behavior

- Consumes only a validated `site.json`; it does not call the crawler or a source adapter.
- Writes deterministic `migration-report.json` and `migration-report.md` artifacts.
- Summarizes pages, nested content blocks, verified, unverified, and remote assets, warnings, and manual-review items.
- Summarizes preserved redirects and requires review for production HTTP redirect configuration.
- Marks a capture as `review-required` when warnings, remote assets, preserved embeds, or raw HTML remain.
- A `crawl-truncated` warning always requires review, even when static verification and bundle integrity checks succeed. `capture` and `rescue` explicitly report incomplete capture instead of an unqualified completion message.
- Truncation uses the existing `{ code, message, sourceUrl }` warning format. Existing captures remain readable, but captures created before this fix cannot reveal previously unrecorded truncation and should be recaptured if their crawl coverage is uncertain.
- Unsafe inline links, omitted active inline content, or unsupported inline semantics produce actionable warnings and require review.
- The report is guidance for migration review; it does not claim visual or functional parity with the source site.

## Site schema compatibility

- New captures use site schema **`1.1.0`**; readers accept both **`1.0.0` and `1.1.0`** and preserve the input version. CLI/package and migration report versions remain unchanged.
- Paragraphs and headings retain their `text` fallback and optionally add `inlines`. Lists retain `items: string[]` and optionally add `itemInlines: InlineNode[][]`, with exactly one inline array per plain item. Supported nodes are `text`, `link`, `strong`, `emphasis`, `code`, `lineBreak`, and anchor `span`.
- Source `id` fields and inline content require `1.1.0`. Missing inline fields use the previous escaped plain-text renderer, so legacy captures and their bundle manifests remain readable without conversion. Manifests retain the capture's actual schema version.
- Older tools reject `1.1.0` rather than silently discarding its new fields. To use rich captures, update the tool; no automatic lossy downgrade is provided. Content already flattened in old captures requires recapturing the original source.
- Inline nesting is bounded at 32 levels. Unsupported semantics or deeper source formatting are flattened/omitted with review warnings. Arbitrary DOM round trips, nested list layout, source CSS semantics, inline media positioning, formatted buttons and image captions remain outside SR-002.
- See [ADR-022](./docs/adr/ADR-022-versioned-inline-content.md) for the focused compatibility proposal. The broader proposed [ADR-020](./docs/adr/ADR-020-source-acquisition-and-offline-import.md), [ADR-021](./docs/adr/ADR-021-rich-content-and-migration-coverage.md) and [handoff](./docs/CODEX_HANDOFF.md) are included in this integration; they originated in [Draft PR #23](https://github.com/cam11505/website_trans/pull/23).

## Static verification behavior

- Scans generated HTML and CSS files and validates local HTML attributes, `@import`, and `url()` references.
- Checks page fragments against HTML `id` and legacy anchor `name` values.
- Rejects unsafe URL schemes, invalid encodings, paths outside the site root, and unverified symbolic-link targets.
- Counts external references but never requests them over the network.
- Returns exit code `2` when broken local references are found, making the command suitable for CI.
- A successful verification proves local file integrity, not migration completeness or external-link availability.

## Local preview behavior

- Runs static verification first and refuses to serve a site with broken local references.
- Serves only on `127.0.0.1`, using port `4173` unless `--port` is supplied.
- Supports normal nested `index.html` routes and common static asset content types.
- Prevents path traversal and symbolic-link escapes outside the selected site directory.
- Uses no-cache response headers so repeated manual reviews read current local files.
- Stops cleanly with `Ctrl+C`; it does not open a browser automatically.

## Rescue bundle integrity behavior

- Treats `capture/`, `site/`, and `report/` as one portable rescue bundle.
- Writes a canonically sorted `rescue-manifest.json` containing relative POSIX paths, roles, byte sizes, and SHA-256 checksums.
- Validates `capture/site.json`, requires reports to match that capture, and runs static verification before writing a manifest.
- Detects missing, unexpected, size-mismatched, and checksum-mismatched files without network access.
- Rejects symbolic links, special filesystem entries, unsafe manifest paths, unexpected top-level entries during manifest creation, and bundles above 100,000 files.
- Returns exit code `2` from `verify-bundle` for integrity mismatches, making it suitable for backup and handoff checks.
- Excludes the manifest itself from its file inventory so identical bundle contents produce identical manifest bytes.
- SHA-256 proves content consistency against the recorded manifest; it is not a digital signature and does not prove who created the bundle.

## Safe output behavior

- `capture`, `export`, `report`, and `rescue` accept only a non-existing output directory.
- Existing files and directories are refused before command work begins and are never modified.
- A failed operation removes only the exact output directory created by that operation.
- `manifest` and `verify-bundle` intentionally inspect an existing rescue bundle.
- Phase 16 does not provide overwrite, resume, or incremental capture modes.

## Release readiness

- All workspace packages must use the root semantic version and remain private before the release policy changes.
- `release:check` rebuilds `release/package`, verifies every checksum, executes bundled `--version` and `--help`, and produces a real migration report from an offline fixture.
- The release package bundles runtime dependencies but still requires Node.js 20.19 or newer.
- Package metadata remains `private: true` to prevent accidental npm publication; the planned first distribution channel is GitHub Releases.
- Root, workspace, and generated package metadata use the `Apache-2.0` SPDX identifier; bundled dependencies remain under their own terms recorded in `THIRD_PARTY_NOTICES.txt`. Exact-version audited license overrides cover published packages that omit their license file.
- Follow [the release checklist](./docs/RELEASE_CHECKLIST.md) before changing visibility, tagging, or publishing.
- See the [public repository publication record](./docs/PUBLICATION_RECORD.md) for the completed visibility, history-audit, and GitHub protection checks.
- See [CHANGELOG.md](./CHANGELOG.md), [CONTRIBUTING.md](./CONTRIBUTING.md), and [SECURITY.md](./SECURITY.md) for project policy.

## Community reports

- Use the structured [bug report](https://github.com/cam11505/website_trans/issues/new?template=bug_report.yml) for reproducible defects with sanitized fixtures and logs.
- Use the [feature request](https://github.com/cam11505/website_trans/issues/new?template=feature_request.yml) for focused migration capabilities.
- Follow [SECURITY.md](./SECURITY.md) and use a private security advisory for vulnerabilities. Never disclose credentials, private website content, personal data, or customer data in an issue.

## Explicitly out of scope before the public v0.1.0 release

- GUI or hosted SaaS
- Cloudflare infrastructure or domain automation
- Payments, CMS, page builder, membership, or e-commerce
- Pixel-perfect cloning or AI redesign
- Astro or framework-specific exporters
- Automatic deployment or hosting
- Host-specific redirect configuration, cross-origin redirects, or query-based redirect rules
- LAN or public-network serving, HTTPS, authentication, or live reload
- Automatically applying source stylesheets by default, CSS optimization, or visual parity analysis
- CSS sanitization, selector translation, theme editing, or an interactive style toggle
- Inline styles and JavaScript-loaded CSS
- JavaScript rendering, browser automation, authenticated crawling, or form behavior recreation
- ZIP/TAR creation, encryption, digital signatures, cloud upload, or incremental backups

## Decisions

See [Architecture Decision Records](./docs/adr/README.md) for accepted ADR-001 through ADR-019 and proposed ADR-020 through ADR-023.

## License

Site Rescue is licensed under the [Apache License 2.0](./LICENSE). Bundled third-party runtime components retain their own licenses and notices.
