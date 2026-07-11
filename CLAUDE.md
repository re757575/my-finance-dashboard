# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

個人資產負債儀表板——去中心化、無伺服器、高度重視隱私的個人財務健康管理網頁。所有資料 100% 儲存在瀏覽器 LocalStorage，不會向任何伺服器傳送使用者的財務數據，且不引入任何外部 Analytics/日誌收集工具。以「月度健康檢查」為核心：不記日常消費流水帳，只做定期（以月為單位）的資產負債總覽與趨勢追蹤。

- 產品需求：[docs/PRD.md](docs/PRD.md)（功能需求、財務計算公式、資料結構、UI/UX 規範、驗收標準）
- 技術選型理由：[docs/TECH_STACK.md](docs/TECH_STACK.md)

## Commands

```bash
npm run dev                                   # 啟動本地開發伺服器 (http://localhost:5173)
npm run build                                 # tsc -b && vite build
npm run typecheck                             # tsc -b --noEmit
npm run lint                                  # oxlint
npm run test                                  # Vitest 單元/元件測試（單次執行）
npx playwright install --with-deps chromium   # 首次執行 e2e 測試前，安裝瀏覽器
npm run test:e2e                              # Playwright e2e（會自動啟動 dev server）
```

執行單一測試檔：`npx vitest run src/lib/calculations.test.ts`
執行單一 e2e 檔：`npx playwright test e2e/dashboard.spec.ts`

Commit 時 `.husky/pre-commit` 會自動依序執行：`lint-staged`（Prettier 格式化）→ `typecheck` → `test`。e2e 測試因啟動較慢，不包含在 pre-commit 內。

## Architecture

### 資料流：單一 LocalStorage 快照陣列

所有應用狀態的根源是 `src/hooks/useLocalSnapshots.ts`，`App.tsx` 是唯一消費此 hook 的元件，其餘元件皆為受控的展示元件（透過 props 收發資料，不直接碰觸 storage）。

- **Schema**（`src/types/schema.ts`）：`FinanceData = { schemaVersion, snapshots: Snapshot[] }`，每個 `Snapshot` 以 `month`（"YYYY-MM"）為顆粒度，同月覆蓋、跨月新增（見 `upsertSnapshot`）。修改 schema 時務必同步遞增 `CURRENT_SCHEMA_VERSION` 並在 `src/lib/storage.ts` 補上 `migrateVxToVy` 遷移函式（現有範例：`migrateV1ToV2`）。
- **draft vs. 已存檔資料**：`useLocalSnapshots` 內部維護 `draft`（當月編輯中的快照，未存檔前只存在於 React state）與 `financeData`（已持久化到 LocalStorage 的全部快照）。`isDirty` 用兩者的 JSON 字串比較判斷。使用者按下「更新儀表板」才會呼叫 `save()` 真正寫入 `persistFinanceData`；重新整理頁面會遺失未存檔的 draft（這是刻意行為，e2e 有覆蓋此案例）。
- **當月表單自動帶入上月資料**：`buildInitialDraft` 在當月尚無快照時，複製最近一筆快照的數值作為初始 draft（月份/時間戳改為當月），減少重複輸入。
- **讀取狀態機**：`parseFinanceData`（`src/lib/storage.ts`）回傳 `LoadResult`（`empty` / `ok` / `corrupted` / `version-mismatch`），從不拋出例外。`version-mismatch` 時 UI 會暫停顯示與存檔功能，避免覆蓋使用者既有但版本不相容的資料——修改此邏輯要格外小心，因為它是防止資料遺失的最後防線。
- **備份／還原**（`src/lib/backup.ts`）：匯出用 Blob + `<a download>` 純前端觸發下載；匯入透過 `parseBackupFile` 走與 LocalStorage 讀取相同的 `parseFinanceData` 驗證規則。清空全部資料前，UI 層必須強制先呼叫 `exportBackup()`，`clearAllData()` 本身不做備份。

### 財務計算（`src/lib/calculations.ts`）

所有數值計算集中於此檔，`calculateMetrics()` 是唯一入口，供 UI 與測試共用：

- `toSafeNumber()`：非數字或空值一律視為 0（PRD 4.2 輸入防呆規則），所有金額欄位計算前都先經過它。
- 美股市值有 `usStockCurrency: "USD" | "TWD"` 計價幣別切換：USD 時乘上 `exchangeRate` 換算成台幣，TWD 時視為使用者已填入台幣等值金額，不重複換算（`calculateTotalStockValue`）。
- 負債比 = 總負債 / 總資產 × 100，總資產為 0 時強制為 0（避免除以零），並以 `calculateDebtRatioStatus` 分四級（`debt-free` / `healthy` / `elevated` / `high-risk`，門檻與文案見該檔）。

### 元件分層

- `src/components/*.tsx`：業務元件（輸入表單、看板卡片、趨勢區塊），大多為純展示元件，透過 `onChange`/`value` 與 `App.tsx` 溝通。
- `src/components/charts/`：Recharts 圖表元件，`EmptyTrendCard` 處理快照數 < 2 個月時的空狀態。
- `src/components/ui/`：shadcn 生成的基礎元件（Radix 封裝），走 `components.json` 的 `radix-nova` 風格設定，一般不手動修改內部實作，需要客製時優先加 wrapper 而非改動生成檔案。
- 路徑別名 `@/*` 對應 `src/*`（`vite.config.ts` 與 `tsconfig` 皆已設定）。

### 測試

- 單元/元件測試（Vitest + Testing Library + jsdom）與被測檔案同目錄、`*.test.ts(x)` 命名，測試環境設定在 `src/test/setup.ts`。
- e2e（Playwright，`e2e/*.spec.ts`）以 `data-testid`（如 `total-assets`、`save-button`）與 `getByRole`/`getByLabel` 定位；每個測試在 `beforeEach` 用 `page.evaluate(() => localStorage.clear())` 重置狀態（注意：故意不用 `addInitScript`，否則測試中的 `page.reload()` 也會被清空）。新增有財務語意的行為時，優先在 `calculations.test.ts` 或對應 hook 測試中覆蓋，UI 互動流程用 e2e 驗證。

## Deployment

`.github/workflows/deploy.yml`：push 到 `main` 會自動 typecheck → 單元測試 → build → 部署到 GitHub Pages（`actions/deploy-pages@v4`）。GitHub Pages 需為 **Public repo**（或 GitHub Pro/Team 以上）且 repo Settings → Pages → Source 設為 **GitHub Actions** 才能成功部署，否則 deploy 步驟會以 404 失敗。`vite.config.ts` 使用 `base: "./"` 相對路徑，因此不需因 repo 名稱而修改設定。
