# Site Rescue — Codex continuation handoff

更新：2026-10-22（Asia/Taipei）。本檔是接手入口；目前進度以 [PROJECT_STATUS.md](./PROJECT_STATUS.md) 為準，執行順序以 [NEXT_STEPS.md](./NEXT_STEPS.md) 為準。

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
2. 確認本文件分支的實際 diff 只有文件；核對 #34 與 #30～#33 的包含關係、目前 CI 及版本差異。
3. 對照 NEXT_STEPS.md Stage A 完成剩餘整合審查，列出待合併候選與舊 PR 重複證據。新的交接文件已完成目前狀態與入口整理，不必重新建立一份同義計畫。
4. 進入 Stage B 時，建立一個聚焦功能分支實作最小 SR-008 terminal wizard，重用既有匯入／報告／預覽核心，依驗收條件完成測試及 Draft PR。
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

共享 lockfile 依 CI 執行 dependency audit；Wizard 新增取消／失敗／非互動行為測試及實際封裝操作驗證。純文件更新核對相對連結、狀態、命令及差異，不新增鏡像文字內容的測試。記錄沒有執行或尚未完成的驗證。

## 可直接使用的接續指令

請在 cam11505/website_trans 接續 Site Rescue，先取得 docs/codex-continuation-20261022 的最新內容，保留本機修改。依 AGENTS.md、docs/PROJECT_STATUS.md、docs/CODEX_HANDOFF.md、docs/NEXT_STEPS.md 執行：先完成 Stage A 剩餘整合審查，再在聚焦分支完成 Stage B 最小 SR-008 terminal wizard，驗證後開 Draft PR。沿用 #34 已含的 #30～#33，不重做既有功能。一般開發步驟持續處理，不自動關閉 PR、合併、Tag 或 Release。
