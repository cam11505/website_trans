# ADR-015: Create deterministic rescue bundle manifests for offline integrity verification

- Status: Accepted
- Date: 2026-08-21

## Context

The end-to-end rescue command produces reusable capture data, a static website, and migration reports. Each captured local asset already has a checksum, but the complete output directory has no inventory that can detect a missing report, modified page, unexpected file, or incomplete copy after backup and handoff.

Phase 15 needs a platform-neutral integrity boundary for the whole rescue result. It must remain local-first, avoid introducing archive-format dependencies, and must not imply cryptographic authenticity when an attacker could replace both a file and its manifest entry.

## Decision

Add a `rescue-manifest` package that validates the standard `capture/`, `site/`, and `report/` artifacts and writes a deterministic root-level `rescue-manifest.json`.

The manifest records its own format version, the normalized site schema version, source metadata, and a canonically sorted list of every regular file under the three standard directories. Each file entry contains a POSIX relative path, semantic role, byte size, and SHA-256 checksum. The manifest does not contain a generation timestamp and does not hash itself, so identical bundle contents produce identical manifest bytes.

Manifest creation requires a validated `capture/site.json`, reports that exactly match the validated capture, and a static site that passes the existing offline verifier. Unexpected top-level entries, symbolic links, special filesystem entries, unsafe paths, and bundles above the bounded file count are rejected.

Expose the package through `site-rescue manifest <rescue-directory>` and `site-rescue verify-bundle <rescue-directory>`. Verification never accesses the network and reports missing, unexpected, size-mismatched, and checksum-mismatched files. Integrity mismatches return CLI exit code 2. The end-to-end `rescue` command writes the manifest only after static verification succeeds.

## Consequences

- A copied rescue directory can be checked for accidental loss or modification before it is deployed or archived.
- Capture, static output, and report artifacts are tied together by one deterministic inventory.
- The format stays independent of Weebly, hosting providers, operating systems, and compression tools.
- SHA-256 checksums detect content changes but do not prove authorship or protect against an attacker who can rewrite the manifest.
- ZIP/TAR creation, encryption, digital signatures, cloud upload, incremental backups, and deployment remain outside this phase.
