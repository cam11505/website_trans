# Public repository publication record

- Publication date: 2026-08-22
- Repository: <https://github.com/cam11505/website_trans>
- Pre-publication `main` commit: `16e3f38a63cba6867f0c396cc3b237f2b929b39d`
- Visibility: Public
- License: Apache-2.0

## Pre-publication audit

- Scanned 38 reachable commits and 133 historical paths across all remote branches.
- Found no common credential patterns, private keys, `.env` files, credential files, or keystore paths.
- Scanned 17 pull requests and all available issue, review, and commit comments; found no common credential patterns.
- Reviewed commit author identities. The maintainer explicitly accepted publication of the existing author email metadata.
- Audited production and development dependencies against the package registry; no known vulnerabilities were reported.
- Confirmed the generated release package contains the project license and 29 bundled third-party runtime license entries.

## GitHub controls

- `main` requires the strict `Quality checks` status check.
- Branch protection applies to administrators, requires linear history and resolved conversations, and disallows force pushes and deletion.
- Pull requests use squash merge; merge commits and rebase merge are disabled.
- Secret scanning, push protection, Dependabot security updates, automated security fixes, and private vulnerability reporting are enabled.
- Structured issue forms and a pull request safety checklist route public contributions.

## Anonymous access verification

Unauthenticated HTTP requests returned success for the repository page, raw `README.md`, raw `LICENSE`, issue-form chooser, and security page after publication.

## Remaining boundary

Repository publication did not create a version tag, GitHub Release, or npm publication. The first `v0.1.0` release still requires the exact-commit process in [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).
