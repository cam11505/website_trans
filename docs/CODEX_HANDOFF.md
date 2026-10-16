# Site Rescue — Codex 開發交接與架構 Review
**更新日期：2026-10-16｜文件性質：原始規劃及整合分支狀態；不代表已合併或已發版**

> 目的：讓下一次進入本 GitHub Repo 的 Codex / 工程師能理解現況、知道先做哪件事、在哪裡改、如何驗收。開發時先讀根目錄 AGENTS.md。
>
> 審查基準：main commit **37798cb3aa71170c0ad60b513a6ae6863da6df67**（2026-08-22）。每次開始請先重新查 HEAD、CI、Issues/PRs。以下問題主要根據原始碼靜態檢查，尚未逐項用真實站台重新驗證。
>
> 最新整合狀態段落是候選驗證時的快照；後續合併與發版狀態以即時查詢 GitHub 為準。

## 最新整合狀態

**2026-10-16 SR-004 後續（本段優先）：** PR #30（`0603063`）仍為 Draft、CI／CodeQL 通過；main 為 `d8834de`。使用者要求繼續下一步，本分支實作通用 HTML 資料夾的 Source Snapshot 1.0.0 與 `replay-source`，先核對保存原檔的完整清單／Hash，再用目前 Generic Adapter 重新解析，不依賴舊 Site JSON 或原始資料夾。來源及舊 Snapshot 不改寫，輸出另存；舊版無 Snapshot 索引時提示明確重新匯入。規格與限制見 ADR-025。這是 SR-004 通用離線部分，Live URL Snapshot 尚未實作；不包含 ZIP、SR-005～008、不合併既有 PR、不發版。後續驗證以新 PR 的 exact-head CI／CodeQL 為準。

**2026-10-14 後續決策（優先於下方歷史規劃）：** PR #29 已經使用者核准 squash merge 至 main `d8834de`；合併後 CI／CodeQL 通過、162 tests passed、五筆依賴告警均 fixed，未發版。使用者接著明確指示不再以真實樣本驗證作為前置條件，繼續完成通用 HTML 資料夾離線匯入。本階段依 ADR-024 新增 `import-source`：保存原檔／Hash／路徑映射 → Generic Adapter → 素材本機化 → Export／Report／Verify／Manifest。以合成離線 fixtures 驗收，不宣稱官方 Weebly 格式已驗證。ZIP、完整 snapshot/parser replay 與 SR-004 以後工作仍分開處理；新 PR 不自動合併、不發版。下方候選分支／Issue open／樣本前置要求為歷史快照，不應重複套用到這次已授權的通用匯入。

使用者要求先將現有成果整合到 GitHub。原始整合 PR #28 集中交接文件、ADR-020～023 與 SR-001／002／003 Inventory；後續安全修補 PR #29 現已調整為直接以 main 為基底的完整候選版，分支為 `codex/security-dependency-alerts`。#29 包含 #28 全部歷史與相依套件修補，可集中審查，無須先合併 #28。main 與正式 v0.1.0 未變更；新 head 須通過自己的 CI／CodeQL，再由使用者明確核准合併。

| 項目 | 本整合分支狀態 | 尚待完成 |
| --- | --- | --- |
| SR-001 | 已實作：截斷擷取記錄 warning，report 必須 review-required | 人工審查／合併；Issue #24 仍 open |
| SR-002 | 已實作：兩個 Adapter 保留行內連結／格式、Schema 1.1.0、舊 1.0.0 讀取相容 | 人工審查／合併；完整 DOM／視覺等價未涵蓋 |
| SR-003 | 部分完成：使用者確認先做通用 HTML 資料夾安全 Inventory | 真實去識別化樣本、官方格式驗證、ZIP 安全與完整離線匯入 |
| SR-004～008 | 未實作 | Snapshot/replay、coverage、query mapping、runtime matrix、引導 UX |

詳細指令、驗證與限制見 [INTEGRATION_PROGRESS.md](./INTEGRATION_PROGRESS.md)。原始 Review／Milestones 保留作為需求背景；下方 SR-001 起始任務已由 PR #25 實作，不應重複視為下一階段。缺乏官方樣本時不得宣稱完整 SR-003 已完成。

## 0. 最重要的決策

**延續現有 Repo，不推倒重做、不改語言。** 維持 TypeScript + pnpm workspace、CLI-first、local-first、Apache-2.0、可擴充 SourceAdapter。以「取得與保存原始資料 → 可靠的正規化 → 可檢查的離線靜態輸出」為產品核心；未來可加平台 Adapter。現階段不加入 SaaS、DNS 自動化、登入、付款、AI 重新設計、所見即所得編輯器。

優先順序：
1. **P0 正確性：** Crawl 被截斷時不得誤顯示遷移已 ready。
2. **P0 無損內容：** 一般段落／清單的超連結及行內格式不可默默變純文字。
3. **P0 離線救援：** 正式支援經過實際 Fixture 驗證的 Weebly ZIP / HTML folder；已關閉的原始網站不應成為阻礙。
4. **P1 可長期保存：** 原始 HTML / Assets 的 Source Snapshot，使 Parser 升級後能重新解析。
5. **P1 證據導向：** 區分來源覆蓋率、轉換完整性、靜態檔案完整性與部署前人工檢查。

## 1. 原始 main Repository 基線（整合分支差異見最新狀態）

- 公開 Repo：https://github.com/cam11505/website_trans
- 名稱／方向：Site Rescue；Weebly 是第一個來源，不是整個產品的架構。
- 正式 GitHub Release **v0.1.0，2026-08-22**；自包含 Node CLI ZIP + SHA-256 校驗檔，仍需使用者安裝 Node。**不是**正式發佈到 npm。
- 該次 Release 記錄：26 個測試檔、99 tests passed；lint、typecheck、build、release:check、當時的 CI/CodeQL 通過。這不是本交接當日重新執行測試的結果。
- 授權：Apache-2.0；README、CONTRIBUTING、SECURITY、CHANGELOG、CI、Issue/PR 模板、19 份 Accepted ADR 已存在。
- main 受保護；PR #22（Dependabot，Vitest 3 → 4）於 2026-10-13 仍 open，未合併。近期 Dependabot 曾有更新失敗，但不能據此直接宣稱產品含未修復漏洞。
- 原始 PR #23 交接**不變更**既有程式碼、版本號、套件相依、main 或 Release；本整合分支另包含後續 PR #25～27 的實作。

## 2. 已有功能（切勿重做）

CLI 支援：
- diagnose URL：偵測來源平台、探索同源頁面；
- capture URL：Crawler + Adapter -> 驗證的 capture/site.json 與素材；
- export site.json：產生靜態 HTML，baseline/source 兩種 CSS 模式；
- report site.json：Markdown/JSON 遷移報告；
- verify site-dir：離線 HTML/CSS 本地參照檢查；
- manifest / verify-bundle：救援 Bundle SHA-256 全檔案完整性；
- preview site-dir：127.0.0.1 本機預覽；
- rescue URL：串接 Capture → Export → Report → Verify → Manifest。

已做：同源有限制爬取、重試/Timeout/Body Size 上限、Weebly 偵測與 Generic HTML fallback、下載素材及遞迴 CSS 引用、素材去重與 Hash、部分 redirect handoff、本機預覽、fresh-output-only 保護、測試 fixture 與 packaged CLI smoke tests。

**目前入口本質仍是 Live URL。** 不應把網站抓取當作官方備份匯入功能。

## 3. 程式碼導航

| 功能 | 現有路徑 |
| --- | --- |
| CLI help / command dispatch | apps/cli/src/index.ts |
| Live capture pipeline | apps/cli/src/capture.ts |
| End-to-end rescue | apps/cli/src/rescue.ts |
| Default adapter registration | apps/cli/src/adapters.ts |
| Adapter interface / selection | packages/core/src/index.ts |
| Schema v1.1.0（讀取 1.0.0 相容） | packages/content-schema/src/index.ts |
| Generic HTML directory Inventory | packages/source-inventory/src/index.ts; apps/cli/src/inspect-source.ts |
| Same-origin HTTP crawl | packages/crawler/src/index.ts |
| HTTP timeouts/retries | packages/http-policy/src/index.ts |
| Weebly parsing | packages/adapters/weebly/src/index.ts |
| Generic HTML parsing | packages/adapters/generic-html/src/index.ts |
| Asset acquisition | packages/asset-pipeline/src/index.ts |
| Static HTML renderer | packages/exporters/static-html/src/index.ts |
| Migration readiness report | packages/report/src/index.ts |
| Static link checker | packages/static-verifier/src/index.ts |
| Bundle manifest/integrity | packages/rescue-manifest/src/index.ts |
| Output directory protection | packages/output-safety/src/index.ts |
| Decision history | docs/adr/README.md |
| Release checks | docs/RELEASE_CHECKLIST.md |

## 4. 原始 Review：缺口與驗收背景（最新狀態見上方表格）

### SR-001 — P0 — Truncated crawl 被誤判為完成
- crawler 的 CrawlResult 有 truncated:boolean（packages/crawler/src/index.ts）。
- runCapture() 使用 crawl.pages 和 crawl.warnings 傳入 adapter.normalize(...)，**沒有傳遞 crawl.truncated**（apps/cli/src/capture.ts）。
- report 的 ready 取決於 site.warnings 與 reviewItems 是否為空（packages/report/src/index.ts）。若單純因 max-pages 截斷且沒有其他 Warning，可能回報 ready。
- **預期修正：** 結構化的截斷告警（如 crawl-truncated），必須讓 migration-report.readiness = review-required；不能混用既有 crawl-fetch-failed 代表所有情況。
- **驗收：** 多頁 Fixture，maxPages=1；Capture 中明確記錄截斷與頁數上下限，report 不為 ready；正常完整抓取不產生該告警；現有流程 regression tests 通過。
- 建議先補測試；可評估在 NormalizeSiteInput 增加 typed diagnostics 或在正規化後追加 warnings，再 parseSite；決策以最小跨模組變動與可擴充性為準。

### SR-002 — P0 — 文字內超連結／格式遺失
- content-schema 的 paragraph.text 與 list.items 是 string；沒有 Inline Rich Text 結構。
- Weebly / Generic HTML Parser 對 p、li 多以 .text() 取得純文字；Static HTML exporter 輸出 escapeHtml(text)。
- 例如「前往 <a href='/guide'>說明</a>」的 href，以及 <strong>、<em> 等行內語意可能丟失。
- **驗收：** Fixture 覆蓋 a[href]、strong、em、code、br、巢狀 inline nodes、相對 URL；導出頁面仍包含可點擊正確連結；連結可透過 static-verifier；現有 v1.0.0 site.json 有明確向後相容/轉換策略。
- Schema 已有 schemaVersion 1.0.0：不得靜默更改既有檔案的含義。先提案版本遷移，再實作。設計草案見 ADR-021。

### SR-003 — P0 — Offline Weebly / HTML archive importer
- 現有 CLI 的 capture/rescue 都要求 URL；runCapture 先 fetchHtmlDocument，再 crawlSameOrigin。
- **目標：** 允許從本機 ZIP 或 HTML folder 匯入；無需連線到已失效的網站。此資料的來源 URL / 路徑與資產引用需要可預期映射。
- **驗收：** 使用安全、去識別化的授權 Weebly Export Fixture，離線匯入 → 產生可驗證的 source/capture -> export/report/verify；導入過程不需要存取原站；不修改/刪除來源資料；遇到未知或缺失格式時給出可操作的 Warning。
- ZIP 安全門檻：拒絕 ..、絕對路徑、Symlink escape、特殊檔案；限制壓縮檔大小、解壓總大小、單檔大小、檔案數及膨脹率；採用安全工作目錄，測試惡意路徑與炸彈。
- **不能先假定** Weebly 官方資料下載一定有完整可部署 HTML。先取得合法測試樣本，依實際 Layout 明確寫 Supported Formats Matrix。設計草案見 ADR-020。

### SR-004 — P1 — Source Snapshot / Parser replay
- capture 主要儲存 normalized site.json + downloaded assets，沒有完整保留各頁原始 HTML。
- 站台下線後，無法利用新版 Adapter 重新解析當時的原始 DOM。
- **驗收：** snapshot 索引保留原始 HTML bytes / URL / Hash / 取得方式 / 元資料；同一 Snapshot 可以重複 normalize，而不再次接觸原站；Snapshot 完整性可由 SHA-256 驗證；不納入密碼、Cookie 或私人 Token。
- Snapshot 格式與原有 rescue manifest 要兼容；可先在 v0.2 加最小必需版，v0.3 完善 replay。

### SR-005 — P1 — Source coverage / accuracy
- 當前 static-verifier 只驗證生成物的本地連結與部分資產引用。成功不代表來源頁面完整收集、行內連結保留或功能遷移成功。
- **驗收：** Report 明確區分 (1) crawl/discovery coverage, (2) source->schema conversion loss/warnings, (3) generated static integrity, (4) manual deployment review。若來源完整度未知，不宣稱 complete 或 fully ready。
- 將「沒有已知損壞」與「已證明完整」分開表述。特殊元素、動態行為、會員/表單/購物車應列人工待處理項目。

### SR-006 — P1 — Query-based URL 與輸出衝突
- static-html 的 targetPathToFile() 忽略 URL query。不同 query 可能映射到相同路徑而引發 Collision（現有 collision protection 會拒絕，不代表支援）。
- **驗收：** 為 query-bearing URLs 明確界定支援範圍；實際來源頁與 target path 有穩定且可回溯的 mapping；絕不覆寫其他頁面； redirect 與 internal link mapping 連動測試。

### SR-007 — P1 — Node.js Runtime / CI matrix
- 目前要求 Node >=20.19.0；Node 20 已 EOL。不要直接改 engines 而未先在目標 Runtime 上跑完 CI / CLI bundle 測試。
- **驗收：** 評估 Node 24 LTS、pinned pnpm 版本及各依賴；調整 .node-version / engines / docs / GitHub Actions；至少驗證 Linux，若準備正式跨平台發行則增加 Windows/macOS smoke tests。

### SR-008 — P2 — Guided local UX
- 為非開發者建立 Wizard 或 GUI，前提是 CLI Core 與離線匯入可靠。
- **驗收：** 選來源 → 分析 → 顯示缺失 → 預覽/匯出；使用者需明確同意任何會寫入檔案的操作；GUI 不繞過 CLI 核心安全策略。
- 不急著做 Tauri/Electron、SaaS 或自動 DNS。

## 5. 建議 Target Architecture（漸進式）

    Live URL ------> HTTP Crawler ----\
                                       \
                                        Source Acquisition / Snapshot
                                       /
    Offline ZIP ----> Secure Import --/
                 HTML Directory --/
                         |
                         v
                 Source Adapter Registry
                 (Weebly / Generic HTML / future)
                         |
                         v
                 Versioned Site Content Schema
                 (Rich Text + provenance)
                         |
                         v
                 Static Exporter
                         |
                         v
                 Integrity + Coverage Verification
                         |
                         v
                 Rescue Bundle + Migration Report

**原則：**
- Source Importer 只處理來源資料如何取得、檔案安全與來源路徑；SourceAdapter 負責各平台 HTML/內容語意。
- 以最小增量新增 source-input/importers/source-snapshot；它們是**建議 Package**，不是目前已存在。
- 不要將 Weebly 特殊處理加入 generic crawler、content schema 或 static exporter。
- 保留 v0.1.0 Release 和可用的 CLI，新增功能應有 rollback/compatibility plan。
- 初始版本不做 DNS 自動化；提供清楚的手動部署、網域指向、HTTP 301 redirect 設定教學。

## 6. 建議 Milestones（可依程式碼結果調整）

| 建議版本 | 主題 | Release gate |
| --- | --- | --- |
| v0.1.1 | Reliability maintenance | SR-001 + regression test；釐清 Node LTS 更新計劃；現有 CLI 無破壞性改變 |
| v0.2.0 | Offline source acquisition | SR-003 的第一個具明確支援格式的 offline importer；安全 ZIP 測試；最小 snapshot；能離線完成 end-to-end |
| v0.3.0 | Content preservation & truthful reporting | SR-002、SR-004、SR-005；Schema compatibility/migration；完整度報告不過度承諾 |
| v0.4.0 | Practical usability | SR-006、引導式操作/預覽修復建議、更多真實 Fixture |
| v1.0.0 | Stable OSS toolkit | 公開安裝文件、相容性矩陣、跨平台安裝驗證、穩定 CLI/schema/adapter 接口、維護與安全政策 |

這不是發版承諾；在實際測試前，不宣稱任何 Milestone 已完成。

## 7. GitHub Issues 草稿與標籤建議

SR-001 已建立 [GitHub Issue #24](https://github.com/cam11505/website_trans/issues/24)；其他 SR-ID 仍是規劃識別碼，尚未建立對應 GitHub Issue。

| ID | 建議標題 | Priority | Acceptance |
| --- | --- | --- | --- |
| SR-001 | fix: propagate crawl truncation into migration readiness | P0 | maxPages fixture → review-required，正常 fixture 不受影響 |
| SR-002 | feat: preserve inline links and formatting in normalized content | P0 | 連結與語意正確導出，舊 Schema 相容策略 |
| SR-003 | feat: support offline Weebly archive and HTML folder import | P0 | 合法 sanitized fixture，完全離線、ZIP 安全防護、輸出驗證 |
| SR-004 | feat: add immutable source snapshots and replay | P1 | 不用原站即可重跑正規化；Hash/索引可驗證 |
| SR-005 | feat: report source coverage and content loss separately | P1 | coverage unknown ≠ ready；清楚的 manual-review items |
| SR-006 | fix: explicitly map query-bearing page URLs to output paths | P1 | 無 collision/overwrite，redirect mapping 有測試 |
| SR-007 | chore: evaluate supported Node LTS and cross-platform CI | P1 | Node 24 release checks, docs and engines consistent |
| SR-008 | feat: guided offline migration user experience | P2 | 操作流程與核心安全策略一致 |

優先建 Issue 給 SR-001（最短且最有價值）、SR-003（產品差異化）和 SR-002（重大內容忠實度），不要一次平行修改 Schema、Importer、Exporter。

## 8. 測試矩陣

| 類別 | 最小測試情境 |
| --- | --- |
| Crawl | >maxPages 截斷、Redirect、404、429、Timeout、跨 Origin、重複 URL |
| HTML parsing | p/a/strong/em/code/br、清單內鏈結、中文 UTF-8、巢狀區塊 |
| Weebly | 真實不同版型的匿名化資料、子選單、Gallery、lazy-load、行內連結 |
| Offline import | ZIP、已解壓 Folder、相對資源路徑、未知官方備份結構 |
| Archive safety | Zip Slip、壓縮炸彈、檔案量過多、Symlink、重複路徑 |
| Content coverage | 沒抓到的頁面、unsupported widgets、遺失的圖片/媒體 |
| Static export | 多層路徑、Query collisions、內部/外部鏈結、redirect fallback |
| Integrity | Asset Hash、Manifest、缺失/修改/多出的檔案、跨平台路徑 |
| Release | Node target version、Windows/macOS/Linux CLI smoke tests |
| Privacy | Fixture 無帳號資料、Token、Cookie、客戶原始網站內容 |

使用實際 Weebly 備份以前，先確認取得授權、移除個資、明確說明哪些格式被測試；不把私人資料提交到公開 Repo。Live website integration tests 保持獨立 opt-in，不納入預設 CI。

## 9. 原始 SR-001 Session 任務（已實作，保留作為驗收背景）

**第一個 PR：只修 SR-001（Crawler truncation readiness），不要順手改 Rich Text 或離線匯入。**

1. 同步 main、確認 PR #22 狀態、閱讀 AGENTS.md 及 docs/CODEX_HANDOFF.md。
2. 在 apps/cli/test 或 packages/report/test 建立含 >1 個同源頁面的離線 Fixture，設 maxPages=1。
3. **先重現**：crawler.truncated=true，但輸出報告沒有相對應的截斷警告。
4. 用最小變動傳播 structured warning；可選擇在 NormalizeSiteInput 擴充 typed diagnostics，或在 normalization 後維持 schema parse/validate。不得把截斷誤標為 crawl-fetch-failed。
5. 驗證報告 readiness='review-required' 且有可理解的待人工檢查訊息，CLI rescue 能明確告知未完整擷取。
6. 跑 pnpm lint、pnpm typecheck、pnpm test、pnpm build、pnpm release:check；附實際測試結果與 Diff Summary。
7. 在新的 feature branch 開 PR，**不要直接合併、不要發布 v0.1.1**。若要修改 Schema 合約，先描述相容性影響。

下一個獨立 PR：在獲得已授權、去識別化的 Weebly Official Export Fixture 並確認格式後，完成 SR-003 的 **安全格式探測/Inventory**，先讓工具判斷能移轉什麼及不能移轉什麼，再做完整轉換。

## 10. 審查限制與產品方向

原始 Review 以 main 的靜態閱讀為準。後續 SR-001／002 與 SR-003 Inventory 已執行離線 regression、五項檢查及實際打包 CLI smoke；PR #27 在 Linux／Node 20.19.0 為 32 個檔案、162 tests 全通過，本機 Windows／Node 24.19.0 為 158 passed／4 Linux-only skipped。這些是原階段的證據；本整合分支仍須重新取得 exact-head CI／CodeQL。尚未對真實 Weebly 官方匯出格式或完整 macOS runtime 做驗證。

中長期可支援更多已停止或受限的建站平台，但必須維持可插拔 Adapter、離線優先、使用者持有資料主權、透明驗證與保留失敗證據的原則。若走商業化，優先考慮安裝/遷移支援、受託服務、進階批次流程；核心離線開源功能保持可用。

## 11. 後續 Session 起始指令

> 請在 cam11505/website_trans repo 依照 AGENTS.md、docs/CODEX_HANDOFF.md 與 docs/INTEGRATION_PROGRESS.md 繼續 Site Rescue。先重新確認 main、整合 Draft PR 與 exact-head CI／CodeQL。SR-001／002 已實作，SR-003 僅有通用 HTML 資料夾 Inventory；不要重做已完成階段或把它當完整匯入。保持 TypeScript/pnpm、CLI-first/local-first、Schema 1.0.0／1.1.0 讀取相容。下一個功能範圍須依使用者指示決定；官方 Weebly 格式仍需要已授權、去識別化樣本。不自行合併、Tag 或發版。功能修改先建立 offline regression，執行 lint/typecheck/test/build/release:check，記錄實際結果與限制。
