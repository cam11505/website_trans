# Site Rescue release checklist

Use this checklist for the first public release and every later release. Release only from a clean, reviewed commit on `main`.

Candidate preparation may occur on a separate Draft PR branch. Record its exact SHA, local archive checksum and actual checks; do not check off main/tag/publication gates merely because a candidate passes. `0.2.0-rc.1` is currently candidate metadata, not a published release. See [ADR-030](./adr/ADR-030-unreleased-candidate-package.md).

The initial repository-publication audit and protection results are recorded in [PUBLICATION_RECORD.md](./PUBLICATION_RECORD.md).

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
- [ ] Use the exact Node pin in `.node-version` and pnpm in `packageManager`; root/generated engines and derived bundle target agree (current development baseline: Node24.22.0, >=24.22.0 <25; pnpm10.34.5).
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [ ] Run `pnpm release:check` and inspect `release/package/SHA256SUMS.txt`.
- [ ] Confirm `node release/package/bin/site-rescue.js --version` prints the release version.
- [ ] Confirm the generated package contains `README.md`, `CHANGELOG.md`, `SECURITY.md`, `LICENSE`, the offline walkthrough/input matrix and the public example with expected results.
- [ ] Review `THIRD_PARTY_NOTICES.txt` and confirm every bundled runtime package has license text and any supplied NOTICE attribution.
- [ ] Review every `third_party/licenses` override against its documented authoritative source and exact package version.
- [ ] Confirm GitHub Actions succeeded for the exact candidate SHA.
- [ ] Confirm the full Linux/Windows/macOS matrix and aggregate `Quality checks` passed on that SHA; inspect actual runner architecture and documented platform-specific skips. All seven packaged offline smokes must run on each platform. Confirm CodeQL independently.
- [ ] Manually inspect example source, import report, preview home/anchor/back navigation/attachment, moved-source replay and both bundle checks; distinguish this inspection from automated checks and complete-site parity.

## Package and release

- [ ] Create the package archive from `release/package` and record its SHA-256 checksum.
- [ ] Extract the archive into an empty temporary directory, verify every internal SHA-256 entry, notices and version, then run the included example through import, moved-source replay and both bundle checks. Record which OS actually tested archive extraction; folder relocation in CI is not native installer or archive-extractor certification.
- [ ] Create an annotated `v<version>` tag at the verified candidate SHA.
- [ ] Push only the verified tag and confirm the remote tag SHA.
- [ ] Create a GitHub Release from that tag with the archive, checksum, changelog summary, requirements, and known limitations.
- [ ] Download the published assets and repeat checksum and CLI smoke verification.
- [ ] Confirm the release page, source archives, installation instructions, and issue/security links are accessible without repository membership.

The generated package remains marked `private: true` to prevent accidental npm publication. The first release is a GitHub Release artifact, not an npm registry publication.
