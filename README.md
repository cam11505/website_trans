# Site Rescue

Site Rescue is a platform-neutral, CLI-first, local-first toolkit for rescuing websites from hosted platforms that are shutting down or becoming inaccessible. Weebly is the first source adapter; it is not the architecture of the product.

> Phase 2 captures a Weebly site into a validated, platform-neutral `site.json`. It does not yet download assets or export a replacement website.

## Current capabilities

- Versioned normalized content schema with runtime validation
- Bounded, deterministic, same-origin HTML crawler
- Weebly detection with confidence and human-readable evidence
- `site-rescue diagnose <url>` CLI command
- `site-rescue capture <url>` normalized JSON capture command
- Offline fixture tests for schema, crawling, adapter detection, and CLI orchestration

## Requirements

- Node.js 20 or newer
- pnpm 10 or newer

## Quick start

```bash
pnpm install
pnpm site-rescue diagnose https://example.weebly.com
pnpm site-rescue capture https://example.weebly.com --output ./capture
```

Limit discovery when testing a large site:

```bash
pnpm site-rescue diagnose https://example.weebly.com --max-pages 20
```

After building, the CLI entry point can also be run directly:

```bash
pnpm build
node apps/cli/dist/index.js diagnose https://example.weebly.com
node apps/cli/dist/index.js capture https://example.weebly.com --output ./capture
```

`capture/site.json` contains site metadata, navigation, normalized pages and blocks, an asset manifest, redirects, and warnings. Asset URLs are recorded but are not downloaded in this phase.

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
│  ├─ crawler/                # Bounded same-origin page discovery
│  └─ adapters/
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

Default tests do not access live websites. Live compatibility checks should remain separate and explicit.

## Crawl behavior and limitations

- Crawls only HTTP(S) links on the exact origin of the starting page.
- Removes URL fragments and ignores common non-document extensions.
- Fetches HTML only, follows links breadth-first, and stops at 50 pages by default.
- Does not execute JavaScript, sign in, bypass access controls, or process private content.
- Client-rendered pages and interaction-only navigation may be missed.

Only crawl and migrate websites you own or are authorized to process. Review the source site's terms and applicable policies before running the tool.

## Explicitly out of scope for phase 2

- GUI or hosted SaaS
- Cloudflare infrastructure or domain automation
- Payments, CMS, page builder, membership, or e-commerce
- Pixel-perfect cloning or AI redesign
- Production exporters, asset downloading, and replacement-site generation

## Decisions

See [Architecture Decision Records](./docs/adr/README.md) for ADR-001 through ADR-008.

## License

No license has been selected yet. Choose and add an open-source license before public distribution.
