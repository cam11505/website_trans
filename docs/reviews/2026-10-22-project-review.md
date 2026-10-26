# Archived planning review

This is the complete analysis prepared on 2026-10-22 before the repository handoff. Its statements about no repository writes describe that analysis turn. For the current delivery state and active execution instructions, use [PROJECT_STATUS.md](../PROJECT_STATUS.md), [CODEX_HANDOFF.md](../CODEX_HANDOFF.md) and [NEXT_STEPS.md](../NEXT_STEPS.md). The original Stage A startup prompt below is historical; the continuation now follows NEXT_STEPS.md.

# Site Rescue：專案進度盤點與下一步規劃
日期：2026-10-22（台灣時間）  
儲存庫：https://github.com/cam11505/website_trans  
定位：Apache-2.0、TypeScript／pnpm、CLI-first、local-first、平台中立的網站救援工具。

## 1. 結論

目前已具備網站擷取、正規化、靜態輸出、驗證、報告與完整性封裝的核心；後續離線功能也已在候選分支形成可測試流程。最迫切的工作是把已驗證的開發成果整合成單一清楚版本，修正過期交接文件，再完成容易使用的入口。

建議順序：
1. 收斂 PR #34 的整合審查與目前狀態文件。
2. 實作 SR-008 的最小引導式 CLI。
3. 整理 v0.2.0 候選版、範例與相容性說明。
4. 後續分開處理 Live URL Snapshot、安全 ZIP 與經格式驗證的 Weebly 匯入。

本次是進度分析及規劃，未修改儲存庫、合併 PR、建立 Issue、Tag 或 Release。

## 2. 三種版本必須分開看

| 層級 | 查到的實際狀態 | 意義 |
| --- | --- | --- |
| 已發布 | v0.1.0，2026-08-22 | 使用者目前下載的 ZIP；未包含後續修正與離線匯入等功能 |
| main | d8834de7dacedb020b4b96e907e23e1f93b1e3b8，2026-10-14 | PR #29 已合併：SR-001、SR-002、HTML Inventory、依賴修正 |
| 最新完整候選版 | Draft PR #34，de0b991d3bc6b332561d2cbcf17ae44a7c377c70，2026-10-16 | 包含 #30～#33，以及 SR-007 runtime／跨平台工作；尚未合併或發版 |

GitHub compare 顯示 #34 比 main 多 6 個 commits、沒有落後，修改 85 個檔案；查詢時 mergeable=true、mergeable_state=clean。這表示 GitHub 能進行合併，不等於已完成人工審查。

PR #34 已包含：
- 0603063：通用 HTML 資料夾離線匯入。
- de46313：來源 Snapshot 與離線重播。
- 980178a：Report 2.0 與來源證據。
- 7531edd：Query URL 與 redirect mapping。
- fc4177b、de0b991：Node24、跨平台 CI、暫時檔案鎖及路徑別名修正。

因此，不能把 #30～#34 當成互相獨立的五個變更直接逐一 squash merge，而不先處理後續 PR 的相依差異。以 #34 作整體審查候選最直接；各階段 commit 仍可用於聚焦 review。

## 3. Roadmap 真實進度

| ID | 功能 | main | #34 完整候選版 | 剩餘邊界 |
| --- | --- | --- | --- | --- |
| SR-001 | Crawl 截斷時誠實顯示狀態 | 已合併 | 已包含 | 舊擷取缺少截斷證據時需重新擷取 |
| SR-002 | 行內連結、粗體、斜體、code、換行與錨點 | 已合併 | 已包含 | 不代表任意 DOM、版面與互動皆能完整保留 |
| SR-003 | 離線來源匯入 | 只有 Inventory | 通用 HTML folder import 已實作（#30） | ZIP、官方 Weebly 匯出格式尚未驗證／支援 |
| SR-004 | Source Snapshot／replay | 尚未實作 | 通用資料夾 Snapshot 與重播已實作（#31） | Live URL 原始來源 Snapshot 尚未實作 |
| SR-005 | 來源／轉換／靜態驗證／人工檢查分開報告 | 尚未實作 | Report 2.0 已實作（#32） | 無法由靜態檢查證明原站完整與視覺等價 |
| SR-006 | Query URL 穩定輸出與 redirect mapping | 尚未實作 | 已實作（#33） | 正式主機 exact-query 路由需人工設定；資料夾 query 仍是檔案對應 |
| SR-007 | Node24 與跨平台驗證 | 尚未合併 | 已實作（#34） | 只涵蓋實際測試的系統與架構 |
| SR-008 | 引導式操作 | 尚未實作 | 尚未實作 | 下一個合適的新功能 |

不以「完成百分比」表示進度：各任務工作量不同，SR-003／004 也只有明確的通用離線子範圍完成。

Issue #24 已於 2026-10-14 關閉。查詢 open issues endpoint 後，11 筆 open 項目全是 PR，沒有獨立開啟的普通 Issue；不要把儲存庫 open_issues_count=11 當成 11 個尚未解決的 bug。

## 4. 已核對的品質證據與限制

本次直接讀取 GitHub CI jobs、steps 及日誌，核對的是 #34 head de0b991，不只引用 PR 自述：

| 平台 | 測試通過 | 跳過 | CI 結果 |
| --- | ---: | ---: | --- |
| Ubuntu 24.04 | 244 | 0 | 成功 |
| Windows 2025 | 238 | 6 | 成功 |
| macOS 15 | 242 | 2 | 成功 |

三平台均使用 Node24.22.0／pnpm10.34.5，37 個測試檔案；lint、typecheck、build、CLI smoke、release check、五組 bundled smoke 都成功。Linux 的共享 lockfile audit 當次顯示 No known vulnerabilities found。CodeQL 的 Actions 與 JavaScript／TypeScript 分析成功。

平台跳過案例主要涉及大小寫、Windows 保留檔名、Unix FIFO 與特權 symlink；Linux 跑到全部案例。不能把跳過等同已驗證該平台的同一檔案系統能力。

本次沒有在新的本機環境重新安裝或執行測試，也沒有拿真實 Weebly 備份做移轉。以上是指定 commit 的既有 CI 證據，不是 2026-10-22 最新依賴資料庫的重新稽核。若修改候選 head，須取得新 head 的驗證結果。

main 最新可見的 2026-10-21 Scheduled run 成功，但那是 main 的排程分析，不能用來宣稱尚未合併的 #34 已在主線執行。

## 5. 架構判斷

維持現有架構，不需要換語言或重做：
- Source acquisition：crawler／html-directory 取得來源。
- Source interpretation：Weebly／Generic HTML adapter 解讀內容。
- Intermediate representation：versioned Site schema。
- Output：static-html exporter。
- Evidence：source-snapshot、report、static-verifier、rescue-manifest。
- CLI：連接上述模組，提供既有操作。

程式確認：
- import-source 重用 generic adapter、asset pipeline、export／verify／report／manifest。
- replay-source 驗證來源 Snapshot 後走同一匯入流程，不依賴原始資料夾與舊 site.json。
- offline folder 一律使用 generic adapter；不能從「資料夾裡有 Weebly HTML」推論成已驗證的官方 Weebly importer。
- Report 2.0 明確保留 review-required；static valid 與 bundle hash 通過是不同證據。
- Source Snapshot 保留原始檔案，重播仍以目前 parser 重新正規化，不保證新舊輸出完全相同。

現階段的主要限制是交付與使用流程尚未收斂，而不是缺少新的框架。應避免為 Wizard 另造 importer、另寫 verifier 或複製資料模型。

產品說法建議使用：
「把仍在線或已保存的靜態網站內容，轉成有來源證據、可檢查的離線網站。」
這較符合現有能力；目前不適合承諾整站版型、表單、購物車或動態功能原樣移轉。

## 6. 第一階段：整合與文件收斂（優先於新功能）

預估投入：2～4 個工作時段，每次約 1～2 小時。這是規劃估算，不是交付承諾。

### 6.1 整理單一候選版

以 PR #34 作為包含 #30～#33 的整體候選，保留各 commit 的聚焦審查方式。標題／描述應清楚說明包含整套離線救援能力，不能只讓人以為是 Node24 設定變更。

驗收：
- 再查 main 與 #34 最新 SHA，確認依賴及差異。
- 所有新增功能與格式變動有對應驗證。
- 修正文件後，新 head 的三平台 CI／CodeQL 通過。
- 在合併前提供實際差異、相容性與測試結果；合併與發版仍是分開決策。

### 6.2 整理重複與被取代的 PR

| PR | 建議處理 |
| --- | --- |
| #23、#25、#26、#27、#28 | 逐一確認內容已由 #29 收錄，再以 superseded 說明關閉 |
| #22 Dependabot | 核對 main lockfile／Vitest 版本與差異；若已被 #29 完整取代再關閉 |
| #30～#33 | 在整體候選成功整合後，再關閉為被 #34 收錄；不要標成各自已 merge |

這些是後續建議，本次沒有執行任何 PR 關閉或留言。

### 6.3 改寫進度文件

實際看到的矛盾：
- main 的 INTEGRATION_PROGRESS.md 仍描述 #29 等待合併，但 live GitHub 顯示已合併。
- 最新 CODEX_HANDOFF.md 上方已有 SR-007，下面的表格卻仍寫 SR-004～008 未實作。
- 最新交接末尾仍說 SR-003 只有 Inventory。
- 最新 README 的部分限制仍說 parser replay 不包含、Snapshot／replay 尚待完成，與已新增的 replay-source 段落矛盾。
- 最新進度文件保留初次 SR-007 CI 失敗／等新 PR 結果的文字，應明確連到已修復 head 的成功驗證。

建議：
- docs/PROJECT_STATUS.md：單一權威目前狀態表，列 main／candidate／release 與 SHA。
- docs/CODEX_HANDOFF.md：只保留現在要接手的任務、約束及入口。
- docs/INTEGRATION_PROGRESS.md：保留歷史，但清楚標為歷史並導向目前狀態。
- README：先說明下載版與開發版差異，再給最短操作例子。
- ADR：逐項審查狹義已落地決策是否接受；保留尚未實作的廣義提案，不因 merge 就把所有 Proposed 一次改成 Accepted。

這個整理能防止下一次 Codex 重做功能、錯選 Node 版本，或把尚未發布的功能當成下載版已具備。

## 7. 第二階段：SR-008 最小引導式 CLI

預估投入：3～5 個工作時段。先做 terminal wizard，延續 CLI-first；GUI 可待實際使用回饋再決定。

建議新增入口（以下是規劃，現在還不存在）：
site-rescue wizard

第一版只引導「通用 HTML 資料夾」：
1. 輸入來源資料夾與新的輸出位置。
2. 在記憶體中分析來源，顯示頁數、素材、缺失參照與不支援項目。
3. 顯示目的地及準備執行的操作，再讓使用者確認執行。
4. 呼叫現有 runImportSource；不另造核心流程。
5. 顯示內容／資源問題摘要、report 與 site 路徑。
6. 顯示預覽指令，或在使用者選擇後啟動既有 preview。

成功畫面必須分開呈現：
- 已產生多少頁。
- 靜態參照檢查是否通過。
- Bundle 完整性驗證結果（必須真的執行才顯示通過）。
- 哪些缺失優先處理。
- 人工檢查仍有哪些項目。

驗收：
- 使用者不用知道 capture／export／manifest 的順序即可完成資料夾救援。
- 取消不產生救援輸出；分析若有落地檔案，事前明示，避免把 inspect-source 當成完全不寫入。
- 來源不變；拒絕既有或重疊的輸出位置。
- 路徑含空白與繁體中文字的情境有覆蓋。
- 保持既有 exit code 語義；區分 0 靜態流程成功、1 致命錯誤、2 靜態驗證失敗，不能把 review-required 當成致命失敗。
- 五組 bundled smoke 與三平台檢查繼續通過；新 Wizard 有流程、取消及失敗路徑驗證。
- 直接 CLI 命令仍可用於腳本與非互動情境。
- 第一版不把 ZIP、Live Snapshot 或報告格式升版混進來。

架構上可先放 apps/cli/src/wizard.ts，使用可注入的 input/output 介面驗證互動流程；共用必要的 orchestration，小範圍抽取即可，不為單一 Wizard 先建大型 framework。

## 8. 第三階段：v0.2.0 候選版與開源展示

建議以 v0.2.0 作下一個版本規劃。理由是功能已跨越修補：通用離線匯入、Snapshot、Report 2.0、Query mapping 與 runtime 下限都改變。不建議把整批內容塞進只有 maintenance 意涵的 v0.1.1。

Release gate：
- 一個乾淨的候選 commit；可追溯到整合及 Wizard 的 review。
- README 有 Download／Requirements／三步使用／Supported inputs／Known limits。
- 新版 CLI、metadata、文件、package version 一致。
- 清楚區分 CLI package 版本與 Site 1.1、Report 2.0、Snapshot 1.0 等資料格式版本。
- 保留舊 Site 1.0／1.1 與 Report 1 bundles 相容案例。
- 提供純合成、可公開的 HTML folder 範例與預期輸出。
- 發版檔本身經 SHA-256、notice/license、三平台 bundled end-to-end 驗證。
- 明列來源輸入支援矩陣：通用 UTF-8 folder 可用、ZIP 不支援、官方 Weebly archive 尚未驗證、Live Snapshot 尚未支援。
- 先做幾次人工端到端試用：來源 → 匯入 → 報告 → 預覽 → 移走來源 → Snapshot 重播 → bundle 驗證。
- 發版須有獨立明確授權；本規劃不代表已核准發布。

開源展示優先補「兩分鐘能理解」的內容：一份範例資料夾、一段短操作錄影、一張真實輸出預覽與一份可讀報告。對使用者採用的幫助，比先加更多抽象套件更直接。

## 9. 之後的技術投資

| 順序 | 工作 | 原因與驗收 |
| --- | --- | --- |
| 後續 A | Live URL Source Snapshot | 把線上取得的原始 HTML／URL／redirect／素材來源與 hash 保存，原站移除後仍能離線重新解析；需獨立 acquisition contract |
| 後續 B | 安全 ZIP 容器輸入 | 解壓到隔離暫存後走既有 folder pipeline；測試 traversal、重複路徑、symlink、解壓量／檔案數／膨脹率限制 |
| 後續 C | 經格式驗證的 Weebly 匯入 | 在通用 folder 與 ZIP 容器之上，依授權、去識別化樣本建立實際格式支援矩陣；不要從 synthetic generic fixtures 宣稱官方格式相容 |
| 後續 D | 媒體與內容忠實度 | 依試用報告優先處理 srcset、lazy loading、未表示區塊及外部依賴；以內容與引用證據驗收 |
| 後續 E | 輕量本機 GUI | 等 CLI 使用流程穩定後，再評估圖形入口；繼續呼叫同一核心 |

真實 Weebly 樣本只限制「官方 Weebly 格式已驗證」的宣稱，不應阻擋一般 folder、Wizard、報告整理與泛用 ZIP 的開發。

## 10. 可直接交給下一次 Codex 的任務

請在 cam11505/website_trans 延續 Site Rescue，先做「整合與文件收斂」，本階段不新增功能。

先讀 AGENTS.md、README.md、docs/CODEX_HANDOFF.md、docs/INTEGRATION_PROGRESS.md 及相關 ADR。重新查 main、所有 open PR、Issue 與 CI。2026-10-22 的盤點基準：main=d8834de；Draft PR #34 head=de0b991，包含 #30～#33，GitHub compare 為 ahead 6／behind 0；其三平台 CI 與 CodeQL 通過。這只是起始線索，請以目前 GitHub 為準。

以完整候選 #34 的內容為基礎，在 feature branch 準備文件更新：單一目前狀態表、精簡交接入口、歷史進度標記、README 的支援範圍與版本差異。修正「#29 等合併」「只有 Inventory」「parser replay 未實作」等過期描述。列出各舊 PR 的重複或相依證據，提出收斂建議；不要默認把 Draft 狀態當成未開發。

保留 TypeScript／pnpm、CLI-first／local-first、Adapter 邊界、所有舊資料相容與輸出保護。區分通用 folder 已實作與官方 Weebly／ZIP 未支援；區分離線 Snapshot 已實作與 Live Snapshot 未實作。不要重做已完成項目，也不要以真實 Weebly 樣本阻擋通用功能。

文件階段以連結、狀態與 CLI／格式名稱交叉核對為主，不新增鏡像文件內容的測試。若修改候選分支或執行會改變待合併 head 的更新，取得該 head 所需 CI；記錄實際結果。給出具體可審查的變更及下一個 SR-008 小範圍計畫。未獲新授權前，不關閉 PR、留言、合併、Tag 或 Release。

## 11. 本次主要證據

- 儲存庫：https://github.com/cam11505/website_trans
- 已合併 PR #29：https://github.com/cam11505/website_trans/pull/29
- 候選 PR #34：https://github.com/cam11505/website_trans/pull/34
- main 與候選比較：https://github.com/cam11505/website_trans/compare/d8834de7dacedb020b4b96e907e23e1f93b1e3b8...de0b991d3bc6b332561d2cbcf17ae44a7c377c70
- 三平台 CI：https://github.com/cam11505/website_trans/actions/runs/38920677453
- CodeQL：https://github.com/cam11505/website_trans/actions/runs/38920672288
- 候選 README：https://github.com/cam11505/website_trans/blob/de0b991d3bc6b332561d2cbcf17ae44a7c377c70/README.md
- 候選交接：https://github.com/cam11505/website_trans/blob/de0b991d3bc6b332561d2cbcf17ae44a7c377c70/docs/CODEX_HANDOFF.md
- 候選進度：https://github.com/cam11505/website_trans/blob/de0b991d3bc6b332561d2cbcf17ae44a7c377c70/docs/INTEGRATION_PROGRESS.md
- 匯入流程：https://github.com/cam11505/website_trans/blob/de0b991d3bc6b332561d2cbcf17ae44a7c377c70/apps/cli/src/import-source.ts
- Snapshot 重播：https://github.com/cam11505/website_trans/blob/de0b991d3bc6b332561d2cbcf17ae44a7c377c70/apps/cli/src/replay-source.ts
- Report 2.0：https://github.com/cam11505/website_trans/blob/de0b991d3bc6b332561d2cbcf17ae44a7c377c70/packages/report/src/index.ts

