# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| `0.1.x` | Yes |
| `< 0.1.0` | No |

Security fixes target the latest `0.1.x` release and the latest commit on `main`.

## Dependency checks

Run `pnpm audit:dependencies` after a frozen install. This checks production and development dependencies against the registry and fails on known advisories at low severity or higher; unavailable registry results are errors, not a clean audit. CI runs the same check. Tests use offline fixtures independently of this network-based metadata check.

See the [2026-10-14 development patch record](./docs/SECURITY_MAINTENANCE_20261014.md) for exact versions and verification. A patched development branch does not update main or an already-published release ZIP; default-branch alert closure requires merged commits and GitHub rescanning.

## Reporting a vulnerability

Do not publish sensitive vulnerability details in a normal issue.

Use GitHub's private vulnerability reporting or a private repository security advisory when that option is available. If private reporting is unavailable, open a minimal issue requesting a private maintainer contact without including exploit details, credentials, private URLs, or customer data.

Include the affected version or commit, operating system, reproduction conditions, impact, and a minimal sanitized proof of concept. Maintainers will acknowledge the report and coordinate status through the private channel; response and remediation timing depend on severity and maintainer availability.

## Safe research boundaries

- Test only websites and systems you own or are authorized to assess.
- Do not include tokens, private content, personal data, or third-party production captures in reports.
- Do not use Site Rescue to bypass authentication, access controls, rate limits, or source-platform policies.
