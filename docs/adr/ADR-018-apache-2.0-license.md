# ADR-018: License Site Rescue under Apache-2.0

- Status: Accepted
- Date: 2026-08-22

## Context

Site Rescue is intended for public source distribution and later third-party platform adapters. The repository needs an explicit license before visibility is changed or `v0.1.0` is published. The selected license must permit reuse and modification while providing clear patent terms and preserving attribution obligations.

The self-contained release package also bundles third-party runtime code. Applying one project license must not erase or misrepresent the independent licenses and NOTICE requirements of those dependencies.

## Decision

License Site Rescue under the Apache License, Version 2.0. Include the unmodified official license text in the root `LICENSE` file and declare the SPDX identifier `Apache-2.0` in root, workspace, and generated package metadata.

The release builder requires the root license and matching metadata, copies `LICENSE` into every generated release package, and uses the esbuild metafile to identify bundled runtime packages. It generates `THIRD_PARTY_NOTICES.txt` containing each bundled package's declared license, full license file, and any supplied NOTICE file. Legal comments are also retained at the end of the bundle.

If a published package omits its license file, an exact package-and-version override may be stored under `third_party/licenses`. Each override must be copied from an authoritative upstream source and have its provenance reviewed. The release gate fails when neither the installed package nor an audited override provides the license text.

No project-level `NOTICE` file is created because no separate Site Rescue attribution notice has been identified. A future attribution requirement must be added through a reviewed change and preserved in distributions.

## Consequences

- Users receive explicit copyright and patent permissions under Apache-2.0, subject to its terms.
- Contributions submitted for inclusion are governed by the contribution terms in Apache-2.0 unless explicitly stated otherwise.
- Third-party bundled code remains governed by its own license and attribution terms.
- License metadata drift or missing dependency license text without an audited exact-version override fails the release package gate.
- This is a project licensing decision, not legal advice for downstream users or contributors.
- Repository visibility, version tags, GitHub Releases, and npm publication remain separate decisions.

## Explicitly out of scope

- Changing repository visibility
- Creating or pushing `v0.1.0`
- Publishing GitHub or npm release artifacts
- Assigning copyright ownership beyond what is established by applicable law and contribution history
- Adding a CLA, DCO, trademark policy, or commercial support agreement
