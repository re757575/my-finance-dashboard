# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

個人資產負債儀表板——去中心化、無伺服器、高度重視隱私的個人財務健康管理網頁。所有資料 100% 儲存在瀏覽器 LocalStorage，不會向任何伺服器傳送使用者的財務數據，且不引入任何外部 Analytics/日誌收集工具。以「定期健康檢查」為核心：不記日常消費流水帳，只做定期的資產負債總覽，歷史趨勢快照則以日為單位保留。

- 產品需求：[docs/PRD.md](docs/PRD.md)（功能需求、財務計算公式、資料結構、UI/UX 規範、驗收標準）
- 技術選型理由：[docs/TECH_STACK.md](docs/TECH_STACK.md)

**文件同步提醒：** 本檔只放流程與指標；各功能的架構說明寫在 [docs/architecture/](docs/architecture/)。每次新增／修改功能後，檢查對應的架構文件與 [README.md](README.md) 是否仍與程式碼行為一致，發現落差要順手更新。

## Commands

指令定義在 `package.json` 的 `scripts`。

- 首次執行 e2e 前先安裝瀏覽器：`npx playwright install --with-deps chromium`。
- Commit 時 `.husky/pre-commit` 先跑 `lint-staged`（Prettier 格式化），再依 staged 的檔案二選一：全是 `*.md` 時只跑**文件檢查** `npx vitest run src/test/docsIntegrity.test.ts`；其餘跑 `lint` → `typecheck` → `test`。e2e 啟動較慢，不包含在內。
- push 到 `main` 時 `.husky/pre-push` 會先跑 `npm run test:e2e`，失敗就擋下這次 push；其他分支與只推 tag 不受影響。

## 開發流程

每當要異動 repo 內的檔案，依序進行，前一步的完成條件達成才進下一步。只改文件（`*.md`）時略過第 2、4 步，第 5 步的完成條件改為 `npx prettier --check .` 與文件檢查通過。

1. **建立 worktree**：執行 `scripts/new-worktree.sh <分支名稱>`，從 `main` 開新分支，worktree 建在上層目錄的 `my-finance-dashboard-<分支名稱最後一段>`，之後所有改動都在裡面進行。完成條件：worktree 內有 `node_modules` 與 `.husky/_`——少了 `.husky/_`，pre-commit 不會執行，也不會有任何錯誤訊息。
2. **先改規格**：異動資料結構（`Snapshot`／`schemaVersion`）、計算公式，或新增畫面上的輸入欄位與指標時，先更新 [docs/PRD.md](docs/PRD.md) 的對應章節（4.1、4.2、5、6 與 6.1 的遷移表、7、9），並在 [docs/PRD_CHANGELOG.md](docs/PRD_CHANGELOG.md) 最上方加上新版本的說明，再寫程式。小型 bug 修正與純外觀調整略過這一步。
3. **實作**：手動驗證、e2e 匯入等需要真實規模資料時，一律用全部虛構的 [fixtures/finance-data.json](fixtures/finance-data.json)（說明見 [docs/architecture/testing.md](docs/architecture/testing.md)），個人備份留在 repo 之外。
4. **測試**：檢查單元/元件測試（`*.test.ts(x)`）與 `e2e/*.spec.ts` 是否需要新增或調整案例（新元件、新看板卡片、新輸入欄位、新計算邏輯等；其他層級已有覆蓋但缺少對應案例時一併補上）。要改的內容分兩種處理：
   - **行為斷言的新增或變更**（新案例、改預期值、改測試描述的行為）：先向使用者說明本次功能異動內容並詢問是否確認無誤，確認後才動手。
   - **機械性修正**（schema 升版後更新寫死的 `schemaVersion`、替測試資料補上新欄位的預設值這類沒有判斷空間的修改）：直接修改，回報時列出改了哪些檔案。
5. **驗證**：完成條件是 `npm run typecheck`、`npm run lint`、`npm run test`、`npm run test:e2e` 全數通過。畫面有變動時，另外執行 `npm run screenshot` 並看過它輸出的截圖，再針對改動的部分在瀏覽器實際操作。
6. **詢問是否 commit**：向使用者回報結果並詢問是否 commit，確認後才執行（訊息依全域的 `/generating-commit-messages` 規範）。完成條件：commit 的輸出中看得到 Commands 所列 pre-commit 各項的執行結果，代表 pre-commit 確實跑過。
7. **併回 `main` 並收尾**：使用者同意 commit 即包含這一步。在主目錄執行 `scripts/finish-worktree.sh <分支>`，它停下來時依訊息處理後重跑。完成條件：腳本印出「<分支> 已併入 main」。push 留給使用者決定——push 到 `main` 就會部署。

## Architecture

所有財務資料狀態的根源是 `src/hooks/useLocalSnapshots.ts`，`App.tsx` 是唯一消費它的元件，其餘元件皆為受控的展示元件。動到下列範圍前，先讀對應的文件：

- **schema、遷移、草稿與存檔、修正模式、快照備註、趨勢圖範圍** → [docs/architecture/data-flow.md](docs/architecture/data-flow.md)
- **備份／還原、加密匯出、拖曳匯入、範例資料、PWA** → [docs/architecture/backup-and-demo.md](docs/architecture/backup-and-demo.md)
- **財務公式、快照比較、成長率與回撤、AI 提示詞** → [docs/architecture/calculations.md](docs/architecture/calculations.md)
- **任何元件的 className、主題切換** → [docs/architecture/dark-mode.md](docs/architecture/dark-mode.md)
- **版面、看板卡片、輸入區、觸控目標、操作圖示** → [docs/architecture/layout.md](docs/architecture/layout.md)
- **圖表、可收合區塊、趨勢圖分頁、`ui/` 元件** → [docs/architecture/components.md](docs/architecture/components.md)
- **寫或改測試、fixture** → [docs/architecture/testing.md](docs/architecture/testing.md)

## Release 與部署

- **版本號與 `CHANGELOG.md` 一律由 `npm run release` 產生**（commit-and-tag-version，依 Conventional Commits），不手動改 `package.json` 的 `version` 或 `CHANGELOG.md`。指令與 0.x 階段的版號規則見 [README.md](README.md)「版本發布」。
- **push 到 `main` 就會部署**到 GitHub Pages（`.github/workflows/deploy.yml`：lint → typecheck → 單元測試 → e2e → build → deploy）。設定見 [README.md](README.md)「部署到 GitHub Pages」，deploy 步驟以 404 失敗時見 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)。
