# Site Rescue — Codex continuation handoff

更新：2026-10-24（Asia/Taipei）。本檔是接手入口；目前進度以 [PROJECT_STATUS.md](./PROJECT_STATUS.md) 為準，執行順序以 [NEXT_STEPS.md](./NEXT_STEPS.md) 為準。

最新候選分支為 `codex/sr-008-offline-wizard`，保留 #35（eb8c22e）及其 #30～34 相依內容。Stage A 整合審查已完成；新安全公告導致的 CI 前置阻礙已用必要依賴更新處理。Stage B 精靈已實作：記憶體分析、不寫入的取消、明確 IMPORT、來源／目的地重查、原匯入核心、實際 Bundle 驗證及獨立選擇本機預覽。參見 ADR-029 與新 Draft PR 的實際驗證；舊 #34 綠燈不代表新 head 通過。不重做 Stage A/B；Stage C 版本候選與發版尚未開始，須另立範圍。

## 使用者目標與目前授權

使用者選擇「開源作品優先、長期經營，未來可產品化」，並要求將本次規劃放到 Codex 接續處理。本交接把完整分析與下一步存入 GitHub，不表示已啟動另一個 Codex session。

一般檢查、文件整理、聚焦實作及 Draft PR 可依任務繼續；合併、Tag、Release 仍需新的明確授權。不得因先前 #29 的合併授權，自動合併 #30 以後的工作。

## 正確起點

儲存庫：cam11505/website_trans  
交接分支：docs/codex-continuation-20261022  
分支基底：PR #34 head de0b991d3bc6b332561d2cbcf17ae44a7c377c70  
main 檢查點：d8834de7dacedb020b4b96e907e23e1f93b1e3b8

這個基底已包含 #30～#33；從舊 main 開始會缺少它們。開始前先檢查工作目錄、main、交接分支與 open PR 最新 SHA，保留本機未提交修改。不要 reset --hard、覆寫來源或強推。

若交接分支尚未在本機，先 fetch，再選取該分支；若本機分支已有額外工作，建立獨立 worktree 或新分支，不覆蓋它。若 upstream 已前進或合併，重新比對內容及相容性，調整基底；不要盲目重複套用舊 commits。

## 已有能力，不要重做

- main 已含 SR-001/002 和安全 HTML Inventory。
- 候選版已有 generic folder import-source。
- 候選版已有 Source Snapshot 1.0.0 / replay-source。
- 候選版已有 Report 2.0.0、acquisition evidence、legacy Report1 bundle 相容。
- 候選版已有 exact-query URL mapping / redirects。
- 候選版使用 Node24.22.0、engines >=24.22.0 <25、pnpm10.34.5，三平台 CI。
- ZIP、官方 Weebly 格式認證與 Live URL Snapshot 尚未完成。
- 真實 Weebly 樣本只限制官方格式驗證，不能阻擋一般 folder／Wizard／泛用 ZIP 工作。

實際測試結果與對應 commit 見 PROJECT_STATUS.md。文件後續 commit 必須使用自己的 CI 結果，不能繼承先前綠燈。

## 第一個接手任務

1. 讀 AGENTS.md、README.md、PROJECT_STATUS.md、NEXT_STEPS.md、相關 ADR。
2. 核對 #35 單獨的交接 commit 僅含文件；新精靈分支另外包含安全依賴修補與程式實作，不得當作純文件變更。確認相依 PR 包含關係、目前 CI 及版本差異。
3. 閱讀 2026-10-24 整合審查與 ADR-029；Stage A/B 已有聚焦候選，不重複實作，也不自動關閉重複 PR。
4. 檢查新精靈候選的 exact-head 三平台 CI／CodeQL、實際封裝操作與相容性證據。後續 Stage C 或來源格式工作另立範圍，不先改版號或發版。
5. 在 PR 中寫明實際驗證、限制、基底及相依；不合併、不 Tag、不發版。

## 架構與資料限制

維持 TypeScript／pnpm、Apache-2.0、CLI-first／local-first、SourceAdapter、versioned schema、fresh-output-only、SHA-256 bundle。CLI 只做操作編排；不要為 Wizard 複製 importer、exporter、report 或 verifier。

來源與輸出分離；不執行來源 JavaScript；不放入客戶資料、credentials 或未授權內容。保留 Site1.0/1.1、舊 Report1 bundle 的既有相容契約。

靜態連結通過、Hash 一致與來源完整度是不同證據。Report2 保持 review-required；UI 必須清楚呈現結果與可處理的缺失，不能為了看起來成功而把 unknown 改為 ready。

## 驗證

功能變更先用離線 regression／fixture 驗證關鍵行為，執行：

    pnpm install --frozen-lockfile
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm build
    pnpm release:check
    node apps/cli/test/packaged-inventory-smoke.mjs
    node apps/cli/test/packaged-import-smoke.mjs
    node apps/cli/test/packaged-replay-smoke.mjs
    node apps/cli/test/packaged-coverage-smoke.mjs
    node apps/cli/test/packaged-query-smoke.mjs
    node apps/cli/test/packaged-wizard-smoke.mjs

共享 lockfile 依 CI 執行 dependency audit；Wizard 新增取消／失敗／非互動行為測試及實際封裝操作驗證。純文件更新核對相對連結、狀態、命令及差異，不新增鏡像文字內容的測試。記錄沒有執行或尚未完成的驗證。

## 可直接使用的接續指令

請在 cam11505/website_trans 接續 Site Rescue，先取得 codex/sr-008-offline-wizard 與 GitHub 最新狀態，保留本機修改。依 AGENTS.md、docs/PROJECT_STATUS.md、docs/CODEX_HANDOFF.md、docs/NEXT_STEPS.md 檢查 Stage A 審查、Stage B 精靈候選及 exact-head 三平台 CI／CodeQL；不重做 SR-001～008 已實作範圍。下一個獨立階段依使用者指示推進；不自動關閉 PR、合併、Tag 或 Release。
