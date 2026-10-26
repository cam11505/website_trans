# Offline walkthrough —0.2.0-rc.1 candidate

The candidate is not published. From a development checkout, use Node24.22.0/pnpm10.34.5 and run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm release:check`. Then open a terminal in `release/package`. An extracted local candidate ZIP has the same package-root layout and needs only Node, not pnpm or the repository.

This walkthrough uses only the included [synthetic starter](../examples/offline-starter/README.md). See its [expected outcomes](../examples/offline-starter/EXPECTED.md) and the [input matrix](./INPUT_SUPPORT.md). Choose new output names every time; commands refuse existing output.

## 1. Confirm the package

```text
node bin/site-rescue.js --version
node bin/site-rescue.js --help
```

Version must be `0.2.0-rc.1`. Review LICENSE, THIRD_PARTY_NOTICES.txt and SHA256SUMS.txt. Before using a ZIP, compare its external SHA-256 with the recorded local candidate checksum; internal hashes do not authenticate an untrusted publisher.

## 2. Import a separate working copy

PowerShell:

```powershell
Copy-Item -LiteralPath ./examples/offline-starter/source -Destination ./example-source-work -Recurse
node bin/site-rescue.js import-source ./example-source-work --output ./example-rescue --style-mode source
```

macOS/Linux:

```bash
cp -R ./examples/offline-starter/source ./example-source-work
node bin/site-rescue.js import-source ./example-source-work --output ./example-rescue --style-mode source
```

Source is a test-owned working copy, separate from output; do not move/overwrite a user's backup. Expect2 pages and3 local assets. Raw bytes stay in `example-rescue/capture/source/files/`.

Optional guided equivalent: `node bin/site-rescue.js wizard`. Enter the working-copy path and a different new output path, review analysis/planned writes, then type IMPORT. Any other execution choice cancels before output creation. Wizard uses baseline style; use the direct command above for source style.

## 3. Read evidence, verify, then preview

Open `example-rescue/report/migration-report.md` in a text editor. It must say review-required and keep original completeness unknown. The observed folder counts are not a completeness percentage. Check all five original files against the Snapshot inventory; compare the original source files if needed.

```text
node bin/site-rescue.js verify ./example-rescue/site
node bin/site-rescue.js verify-bundle ./example-rescue
node bin/site-rescue.js preview ./example-rescue/site
```

Preview prints a127.0.0.1 URL. Open it manually, check the Chinese home page, click 操作說明/#steps and return home, and open/download 檢查清單. Ctrl+C stops the server. Preview does not start a browser automatically or recreate external services. A different port can be selected with `--port` if4173 is busy.

## 4. Move only the working copy, then replay saved source

After preview stops, PowerShell:

```powershell
Move-Item -LiteralPath ./example-source-work -Destination ./example-source-moved
```

macOS/Linux:

```bash
mv ./example-source-work ./example-source-moved
```

Move only that newly copied example directory, after checking its resolved source/destination are within this example workspace. Never move/delete customer originals. The saved Snapshot does not require the old working-copy path:

```text
node bin/site-rescue.js replay-source ./example-rescue/capture/source --output ./example-replayed --style-mode source
node bin/site-rescue.js verify-bundle ./example-rescue
node bin/site-rescue.js verify-bundle ./example-replayed
```

Expect2 pages/3 assets and review-required again; the source Snapshot hashes/acquisition provenance remain intact. The previous normalized Site is not the replay input.

繁體中文：複製內附範例 → 匯入新目錄 → 閱讀報告 → 核對 Bundle → 手動開啟本機預覽 → 停止預覽 → 只搬移範例工作複本 → 以已保存 Snapshot 重播 → 再核對兩份 Bundle。ZIP 輸入、官方 Weebly 格式及 Live Snapshot 尚未支援。正式合併、Tag 與發版必須另行核准。
