# ADR-017: Build and verify a self-contained CLI release package

- Status: Accepted
- Date: 2026-08-21

## Context

Site Rescue is a TypeScript monorepo whose compiled CLI imports private workspace packages. A source checkout works with pnpm, but copying only `apps/cli/dist` does not produce a standalone download. The planned public `v0.1.0` release needs a repeatable artifact boundary and exact-version smoke checks before the repository is made public or tagged.

Phase 17 must prepare that boundary without selecting the license, changing repository visibility, creating a tag, or publishing a release prematurely.

## Decision

Add a private `release-tools` workspace package. It validates that every workspace package uses the root semantic version and remains private, then bundles the CLI and its runtime dependencies into one Node.js 20.19-compatible ESM entry point with esbuild.

The generated `release/package` directory contains the bundled CLI, package metadata, README, changelog, security policy, optional license, source map, and a canonically ordered `SHA256SUMS.txt`. Generated release output is ignored by Git.

The verifier rejects missing, extra, modified, or non-regular package files. It executes the bundled CLI with `--version` and `--help`, requires the reported version to equal workspace metadata, and produces a real migration report from a generated offline fixture. CI runs this release-package check after normal lint, typecheck, tests, build, and built-CLI smoke checks.

Until a license is selected, generated metadata explicitly uses `UNLICENSED`. When a root `LICENSE` file and license metadata are added, the builder requires both and includes the license automatically. Workspace and generated package metadata remain `private: true` to prevent accidental npm registry publication; the planned first distribution channel is a GitHub Release artifact.

## Consequences

- Release candidates have one self-contained CLI entry point instead of requiring workspace dependency installation.
- Version drift and artifact tampering are detected before tagging.
- The same package check runs locally and in CI without live website access.
- Contributors receive changelog, security, contribution, and exact-commit release guidance.
- The package still requires Node.js 20.19 or newer and is not a native executable.
- Apache-2.0 selection, public visibility, archive publication, tags, and the `v0.1.0` GitHub Release remain explicit later steps.

## Explicitly out of scope for phase 17

- Selecting or adding an open-source license
- Changing GitHub repository visibility
- Creating or pushing a version tag
- Publishing a GitHub or npm release
- Native executables, installers, auto-update, code signing, or notarization
- GUI, hosted SaaS, infrastructure, domain automation, payments, CMS, e-commerce, membership, pixel-perfect cloning, or AI redesign
