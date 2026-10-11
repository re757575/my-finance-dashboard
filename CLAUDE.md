# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

個人資產負債儀表板——去中心化、無伺服器、高度重視隱私的個人財務健康管理網頁。所有資料 100% 儲存在瀏覽器 LocalStorage，不會向任何伺服器傳送使用者的財務數據，且不引入任何外部 Analytics/日誌收集工具。以「定期健康檢查」為核心：不記日常消費流水帳，只做定期的資產負債總覽，歷史趨勢快照則以日為單位保留。

- 產品需求：[docs/PRD.md](docs/PRD.md)（功能需求、財務計算公式、資料結構、UI/UX 規範、驗收標準）
- 技術選型理由：[docs/TECH_STACK.md](docs/TECH_STACK.md)

**文件同步提醒：** 本檔只放流程與指標；各功能的架構說明寫在 [docs/architecture/](docs/architecture/)。每次新增／修改功能後，檢查對應的架構文件與 [README.md](README.md) 是否仍與程式碼行為一致，發現落差要順手更新。

## Commands

指令定義在 `package.json` 的 `scripts`（`dev`／`build`／`typecheck`／`lint`／`test`／`test:e2e`）。

- 首次執行 e2e 前先安裝瀏覽器：`npx playwright install --with-deps chromium`。
- Commit 時 `.husky/pre-commit` 依序執行 `lint-staged`（Prettier 格式化）→ `typecheck` → `test`；e2e 啟動較慢，不包含在內。

## 開發流程

每當要異動程式碼，依下列順序進行：

1. **從 `main` 建立新分支與 git worktree**：不直接在 `main` 上修改，改動一律在新分支對應的 worktree 內進行。
2. **實際測試資料使用 [fixtures/finance-data.json](fixtures/finance-data.json)**：手動驗證、e2e 匯入等需要真實規模資料時都用這份（說明見 [docs/architecture/testing.md](docs/architecture/testing.md)），不要使用含真實帳戶名稱或金額的個人備份。
3. **功能改完後檢查測試是否要跟著改**：檢查單元/元件測試（`*.test.ts(x)`）與 `e2e/*.spec.ts` 是否需要跟著新增或調整測試案例（新元件、新看板卡片、新輸入欄位、新計算邏輯等，即使部分已有其他層級測試覆蓋，仍缺乏對應案例時要一併補上），避免功能與測試覆蓋範圍脫節。發現需要異動單元測試或 e2e 測試時，先向使用者說明本次功能異動內容並詢問是否確認無誤，待使用者確認後才動手修改測試。
4. **功能完成後詢問使用者是否要 commit**：不自行 commit，待使用者確認後才執行（commit 訊息見全域的 `/generating-commit-messages` 規範）。
5. **commit 完成後才關閉 worktree**：commit 前不可移除 worktree，避免遺失未提交的改動。

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
- **push 到 `main` 就會部署**到 GitHub Pages（`.github/workflows/deploy.yml`：typecheck → 單元測試 → e2e → build → deploy）。設定見 [README.md](README.md)「部署到 GitHub Pages」，deploy 步驟以 404 失敗時見 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)。
