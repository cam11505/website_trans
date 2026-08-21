# ADR-016: Use bounded HTTP retries and fresh-output-only writes

- Status: Accepted
- Date: 2026-08-21

## Context

Website rescue runs can fail because of brief network interruptions, overloaded source servers, unexpectedly large responses, or an output path that already contains valuable files. Earlier phases bounded page count and individual asset size, but HTML reads were unbounded, HTTP failures were not retried, and output-producing commands could write into existing directories.

Phase 16 needs one platform-neutral reliability policy for HTML and asset requests and one conservative lifecycle for generated output. The policy must stay local-first, be deterministic enough for tests and operator expectations, and must never interpret a failed run as permission to remove a pre-existing path.

## Decision

Add an `http-policy` package shared by the crawler and asset pipeline. Requests default to two retries after the initial attempt. Only HTTP 408, 429, 500, 502, 503, and 504 responses and transient fetch or timeout failures are retried. Backoff is deterministic exponential delay, starting at 250 ms and capped at 2 seconds. Permanent HTTP responses such as 404 are returned immediately.

Each attempt is time-bounded. HTML requests default to 15 seconds and HTML response bodies are limited to 5 MiB. Asset requests keep their existing 30-second timeout and 50 MiB body limit. Both declared `Content-Length` and streamed bytes are checked before a response body is accepted.

Expose bounded CLI overrides on `diagnose`, `capture`, and `rescue`: `--max-retries` accepts 0 through 5, while `--request-timeout-ms` and `--max-html-bytes` accept positive integers.

Add an `output-safety` package and require `capture`, `export`, `report`, and `rescue` to use a new, non-existing output directory. An existing path is refused before command work begins and is never modified. If an operation fails, the tool removes only the exact directory it created for that operation. `manifest` and `verify-bundle` continue to inspect an existing rescue bundle and are not output-creation commands.

## Consequences

- Brief source-server and network failures can recover without operator intervention.
- Permanent failures do not incur unnecessary retries.
- HTML and asset memory use is bounded before complete bodies are accepted.
- A typo or repeated command cannot merge with or overwrite an existing output directory.
- Failed commands do not leave a partial newly-created output tree.
- Users must choose a new output path for every new `capture`, `export`, `report`, or `rescue` run.
- Resume, overwrite, checkpointing, concurrent downloads, rate-limit header interpretation, and random jitter remain outside this phase.

## Explicitly out of scope for phase 16

- GUI or hosted SaaS
- Cloudflare infrastructure or domain automation
- Payments, CMS, page builder, membership, or e-commerce
- Pixel-perfect cloning or AI redesign
- Automatic deployment or hosting
- Resume, incremental capture, or an overwrite flag
- Concurrent downloads, adaptive throttling, or `Retry-After` scheduling
- JavaScript rendering, browser automation, authenticated crawling, or form behavior recreation
- ZIP/TAR creation, encryption, digital signatures, or cloud upload
