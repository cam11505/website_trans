# Input and compatibility matrix — candidate0.2.0-rc.1

This describes the unreleased candidate, not the historical v0.1.0 download.

| Input / operation | Status | Boundary |
| --- | --- | --- |
| Generic UTF-8 HTML folder | Supported within current bounded static scope | Root index.html/index.htm, separate new output, no symlinks/junctions/special files; source remains unchanged |
| Terminal wizard | Generic folder only | Interactive TTY; in-memory analysis, explicit IMPORT, separate preview choice |
| Saved Source Snapshot1.0.0 | Offline replay supported | Exact indexed original file set/hashes; current generic adapter; old Site JSON and original source folder not required |
| Live HTTP(S) URL capture | Existing bounded crawler | Authorized same-origin observed pages/assets/redirects; no browser JS execution or authenticated service recreation |
| Live URL raw-source Snapshot | Unavailable | Current Live capture is not the generic offline raw Snapshot contract |
| ZIP / TAR source input | Unsupported | Do not pass archives to import-source; secure extraction is future work |
| Official Weebly export formats | Unverified | Generic fixtures do not establish official backup format compatibility |
| Saved Site1.0.0 /1.1.0 | Both read | Retain input version; data schemas are independent of application0.2.0-rc.1 |
| Saved Report1.0.0 bundles | Frozen compatibility path | Validate existing evidence; do not silently regenerate as Report2 |
| New Report2.0.0 | Review required | Acquisition/conversion/static/manual evidence stay separate |
| Query routes | Observed exact resource mapping | Local filenames/mapping; original query routing on a host remains manual |
| GUI / hosting / DNS automation | Not implemented | Preview is a loopback-only static server |

New candidate packages require Node >=24.22.0 <25, with CI pinned24.22.0 and pnpm10.34.5 for development. Hosted Ubuntu24.04/x64, Windows2025/x64 and macOS15/arm64 checks cover those actual environments; they do not certify every OS/CPU or native installer. Package and schema versions are distinct: Snapshot1, acquisition evidence1, URL mapping1 and rescue manifest1 retain their existing contracts; query redirect handoff2 does not change plain redirect handoff1.

Static links and SHA-256 consistency are integrity evidence, not proof of source completeness, provenance authenticity, visual parity, functional equivalence or safe production deployment. Review uninspected/dynamic/external services and original query values before sharing output. A candidate branch/archive is not a released product; no npm/GitHub publication is part of Stage C.
