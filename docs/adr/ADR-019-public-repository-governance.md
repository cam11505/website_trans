# ADR-019: Publish with guarded public repository controls

- Status: Accepted
- Date: 2026-08-22

## Context

Site Rescue is intended for open-source distribution. Changing a repository from private to public exposes every reachable commit, branch, pull request, author identity, and discussion. Public contribution channels also increase the chance that users accidentally submit credentials, private website content, customer data, or undisclosed vulnerability details.

The project needs a repeatable publication boundary that protects source history, keeps `main` releasable, and directs sensitive reports away from public issues.

## Decision

Before publication, review the complete reachable Git history, filenames, commit author identities, remote branches, pull requests, issues, comments, dependency advisories, and release artifacts. Publication requires an explicit maintainer decision after any privacy exposure is reported.

Provide structured bug and feature forms, disable blank issues, and require reporters to confirm authorization and sanitization. Provide a pull request checklist covering deterministic tests, private data, platform boundaries, and release verification. Route vulnerability reports to GitHub private security advisories.

After publication, protect `main` with the CI quality check, disallow force pushes and branch deletion, require conversation resolution, enable private vulnerability reporting and GitHub security analysis where available, and verify repository access without membership. Use a meaningful description and focused topics. Keep version tagging and the first GitHub Release as a separate exact-commit process.

## Consequences

- Public contribution paths explicitly discourage disclosure of private or customer data.
- A clean content scan does not replace the maintainer's privacy decision about author metadata and historical context.
- Direct changes to `main` are constrained after publication; normal changes use pull requests and CI.
- Repository publication does not itself create or approve `v0.1.0`.
- Security controls that GitHub exposes only for public repositories are enabled and verified immediately after the visibility change.

## Explicitly out of scope

- Rewriting Git history without explicit maintainer approval
- Deleting historical branches without explicit maintainer approval
- Creating a version tag or GitHub Release
- Publishing to npm
- Establishing a CLA, DCO, trademark policy, or guaranteed support SLA
