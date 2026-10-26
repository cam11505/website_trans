# Expected outcomes

After `import-source source --output <new-path> --style-mode source`:

| Evidence | Expected result |
| --- | --- |
| Original inventory | 5 regular files: 2 HTML, 1 CSS, 1 SVG, 1 text attachment |
| Normalized Site | 2 pages, Site1.1.0, generic-html adapter |
| Local assets | 3 checksummed files; one applied source stylesheet |
| Exported navigation | `index.html` and `guide/index.html`; `#steps` links resolve |
| Report | Report2.0.0, review-required; original completeness unknown, manual review not assessed |
| Source acquisition | The observed folder scope is complete; this is not proof that the original website is complete |
| Static integrity | Actual reference verification valid; no broken local link or fragment |
| Bundle integrity | Actual verify-bundle valid; all original bytes and generated files match its manifest |
| Replay | Still2 pages/3 assets after the test-owned source working copy is moved; raw source hashes unchanged |

Read `report/migration-report.md` from the generated output. Warnings about synthetic origin and manual review are intentional; no100% preservation/ready claim should appear. Original files are copied byte-for-byte into `capture/source/files/` and indexed by Source Snapshot1.0.0. The synthetic origin is `https://site-rescue.invalid/`, never a recovered public domain.

The report may list zero structured manual-review items. This does not mean a person completed review: the authoritative manual-review status remains `not-assessed` and readiness remains `review-required`.

Generated assets use hash filenames, so do not expect source names under site/assets. Capture timestamps, package paths, platform byte sizes/line endings and file-count totals in the whole rescue manifest may differ; source/hash consistency and the supported semantic outcomes above are what to verify.
