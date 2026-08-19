# ADR-011: Serve verified exports on a loopback-only local preview server

- Status: Accepted
- Date: 2026-08-20

## Context

Site Rescue can export and verify a static website, but reviewing that output through `file://` does not reproduce normal browser handling of root-relative links, nested routes, or content types. Phase 11 needs a local review path without introducing hosting infrastructure or a graphical application.

## Decision

Add a platform-neutral preview-server package and expose it through `site-rescue preview <site-directory> [--port <number>]`.

The CLI runs the existing offline static verifier before opening a listener and refuses to serve an invalid site. The server binds only to `127.0.0.1`, supports `GET` and `HEAD`, maps directories to `index.html`, sends explicit content types and no-cache headers, and verifies resolved files remain inside the preview root, including after symbolic-link resolution.

The default port is `4173`. The CLI does not open a browser automatically and closes the server cleanly on `Ctrl+C` or process termination.

## Consequences

- Users can review a verified rescued site with normal HTTP behavior before deployment.
- The preview server is intentionally unsuitable for LAN sharing or production hosting.
- Verification remains the single integrity gate shared by `verify`, `rescue`, and `preview`.
- Live reload, HTTPS, authentication, browser automation, deployment, and public-network binding remain outside this phase.
