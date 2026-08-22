# Site Rescue release checklist

Use this checklist for the first public release and every later release. Release only from a clean, reviewed commit on `main`.

## Public-release gates

- [ ] Phase 17 release-readiness changes are merged and `main` CI is successful.
- [ ] `LICENSE` contains the approved Apache-2.0 text.
- [ ] Root and generated package metadata declare `Apache-2.0`.
- [ ] Scan all reachable Git history, branches, PRs, issues, reviews, and comments for credentials and private or customer data.
- [ ] Review commit author names and email addresses as intentionally public metadata.
- [ ] Run dependency vulnerability audits for production and development dependencies.
- [ ] Confirm repository description, topics, issue forms, pull request template, and security-reporting route.
- [ ] `CHANGELOG.md` moves release content from `Unreleased` to the exact version and date.
- [ ] `SECURITY.md`, private vulnerability reporting, repository description, and topics are reviewed.
- [ ] Repository visibility is intentionally changed to public only after secret and history review.
- [ ] After publication, protect `main`, enable available GitHub security analysis, and verify access without repository membership.

## Exact-commit verification

- [ ] Record the candidate commit SHA and confirm local `main`, `origin/main`, and the candidate SHA match.
- [ ] Run `pnpm install --frozen-lockfile` on the candidate.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [ ] Run `pnpm release:check` and inspect `release/package/SHA256SUMS.txt`.
- [ ] Confirm `node release/package/bin/site-rescue.js --version` prints the release version.
- [ ] Confirm the generated package contains `README.md`, `CHANGELOG.md`, `SECURITY.md`, and `LICENSE`.
- [ ] Review `THIRD_PARTY_NOTICES.txt` and confirm every bundled runtime package has license text and any supplied NOTICE attribution.
- [ ] Review every `third_party/licenses` override against its documented authoritative source and exact package version.
- [ ] Confirm GitHub Actions succeeded for the exact candidate SHA.

## Package and release

- [ ] Create the package archive from `release/package` and record its SHA-256 checksum.
- [ ] Install the archive into an empty temporary directory and run `site-rescue --help` and `site-rescue --version`.
- [ ] Create an annotated `v<version>` tag at the verified candidate SHA.
- [ ] Push only the verified tag and confirm the remote tag SHA.
- [ ] Create a GitHub Release from that tag with the archive, checksum, changelog summary, requirements, and known limitations.
- [ ] Download the published assets and repeat checksum and CLI smoke verification.
- [ ] Confirm the release page, source archives, installation instructions, and issue/security links are accessible without repository membership.

The generated package remains marked `private: true` to prevent accidental npm publication. The first release is a GitHub Release artifact, not an npm registry publication.
