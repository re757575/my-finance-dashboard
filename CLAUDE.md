# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

個人資產負債儀表板——去中心化、無伺服器、高度重視隱私的個人財務健康管理網頁。所有資料 100% 儲存在瀏覽器 LocalStorage，不會向任何伺服器傳送使用者的財務數據，且不引入任何外部 Analytics/日誌收集工具。以「定期健康檢查」為核心：不記日常消費流水帳，只做定期的資產負債總覽，歷史趨勢快照則以日為單位保留。

- 產品需求：[docs/PRD.md](docs/PRD.md)（功能需求、財務計算公式、資料結構、UI/UX 規範、驗收標準）
- 技術選型理由：[docs/TECH_STACK.md](docs/TECH_STACK.md)

**文件同步提醒：** 每次新增／修改功能後，檢查本檔（CLAUDE.md）與 [README.md](README.md) 描述的架構、指令、版本發布流程是否仍與程式碼行為一致，發現落差要順手更新，避免文件與實際行為脫節。

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

- **Schema**（`src/types/schema.ts`）：`FinanceData = { schemaVersion, snapshots: Snapshot[] }`，每個 `Snapshot` 以 `date`（"YYYY-MM-DD"）為顆粒度，同日覆蓋、跨日新增（見 `upsertSnapshot`）。修改 schema 時務必同步遞增 `CURRENT_SCHEMA_VERSION`（現為 6）並在 `src/lib/storage.ts` 補上 `migrateVxToVy` 遷移函式，同時串進 `migrateFinanceData` 的完整遷移鏈（現有範例：`migrateV1ToV2` ... `migrateV5ToV6`）。
- **draft vs. 已存檔資料**：`useLocalSnapshots` 內部維護 `draft`（當日編輯中的快照，未存檔前只存在於 React state）與 `financeData`（已持久化到 LocalStorage 的全部快照）。`isDirty` 用兩者的 JSON 字串比較判斷。使用者按下「更新儀表板」才會呼叫 `save()` 真正寫入 `persistFinanceData`；重新整理頁面會遺失未存檔的 draft（這是刻意行為，e2e 有覆蓋此案例）。
- **當日表單自動帶入最近一筆資料**：`buildInitialDraft` 在當天尚無快照時，複製最近一筆快照的數值作為初始 draft（日期/時間戳改為今天）。負債清單會額外呼叫 `advanceDebtsByMonths` 依曆月差自動攤還本息、遞減剩餘期數（本息平均攤還會重算剩餘本金，只計息只減期數），並回傳 `estimatedFields` 標記哪些欄位是系統估算；使用者手動修改該筆負債的本金或期數後，`updateDebts` 會清除該筆的估算標記。
- **讀取狀態機**：`parseFinanceData`（`src/lib/storage.ts`）回傳 `LoadResult`（`empty` / `ok` / `corrupted` / `version-mismatch`），從不拋出例外。`version-mismatch` 時 UI 會暫停顯示與存檔功能，避免覆蓋使用者既有但版本不相容的資料——修改此邏輯要格外小心，因為它是防止資料遺失的最後防線。
- **備份／還原**（`src/lib/backup.ts`）：匯出用 Blob + `<a download>` 純前端觸發下載；匯入透過 `parseBackupFile` 走與 LocalStorage 讀取相同的 `parseFinanceData` 驗證規則。清空全部資料前，UI 層必須強制先呼叫 `exportBackup()`，`clearAllData()` 本身不做備份。
- **PWA**（`vite-plugin-pwa`）：`registerType: "prompt"` 只快取建置產出的同源靜態檔案，不新增任何對外網路請求，符合零伺服器傳輸原則；更新提示 UI 見 `src/components/PwaUpdatePrompt.tsx`。

### 財務計算（`src/lib/calculations.ts`）

所有數值計算集中於此檔，`calculateMetrics()` 是唯一入口，供 UI 與測試共用：

- `toSafeNumber()`：非數字或空值一律視為 0（PRD 4.2 輸入防呆規則），所有金額欄位計算前都先經過它。
- 美股市值有 `usStockCurrency: "USD" | "TWD"` 計價幣別切換：USD 時乘上 `exchangeRate` 換算成台幣，TWD 時視為使用者已填入台幣等值金額，不重複換算（`calculateTotalStockValue`）。
- 負債比 = 總負債 / 總資產 × 100，總資產為 0 時強制為 0（避免除以零），並以 `calculateDebtRatioStatus` 分四級（`debt-free` / `healthy` / `elevated` / `high-risk`，門檻與文案見該檔）。
- 除負債比外，另有緊急預備金月數、儲蓄率、資產配置比例、FIRE／淨資產目標進度等多項健康指標，計算式與分級門檻皆定義在 `calculateMetrics()` 回傳的 `CalculatedMetrics`，實作細節見該檔逐一函式與 [docs/PRD.md](docs/PRD.md) 第 5 節。

### AI 分析提示詞（`src/lib/promptBuilder.ts`）

`buildFinancePrompt()` 依 `PromptMode`（財務健康檢查／投資方向評估／負債清償策略／定期回顧報告／資產配置再平衡建議共 5 種）組出給外部 AI 使用的 Markdown 文字，由 `CopyPromptButton` 觸發複製到剪貼簿。全程不對外發送任何請求，使用者需自行貼到外部 AI 工具（見 [docs/PRD.md](docs/PRD.md) 4.2 節）。

### 元件分層

- `src/components/*.tsx`：業務元件（輸入表單、看板卡片、趨勢區塊），大多為純展示元件，透過 `onChange`/`value` 與 `App.tsx` 溝通。
- `src/components/charts/`：手刻 SVG 圖表元件（刻意不引入 Recharts/D3 等圖表庫，見 [docs/TECH_STACK.md](docs/TECH_STACK.md) 第 3 節），`EmptyTrendCard` 處理快照筆數 < 2 時的空狀態。
- `src/components/ui/`：shadcn 生成的基礎元件（Radix 封裝），走 `components.json` 的 `radix-nova` 風格設定，一般不手動修改內部實作，需要客製時優先加 wrapper 而非改動生成檔案。
- 路徑別名 `@/*` 對應 `src/*`（`vite.config.ts` 與 `tsconfig` 皆已設定）。

### 測試

- 單元/元件測試（Vitest + Testing Library + jsdom）與被測檔案同目錄、`*.test.ts(x)` 命名，測試環境設定在 `src/test/setup.ts`。
- e2e（Playwright，`e2e/*.spec.ts`）以 `data-testid`（如 `total-assets`、`save-button`）與 `getByRole`/`getByLabel` 定位；每個測試在 `beforeEach` 用 `page.evaluate(() => localStorage.clear())` 重置狀態（注意：故意不用 `addInitScript`，否則測試中的 `page.reload()` 也會被清空）。新增有財務語意的行為時，優先在 `calculations.test.ts` 或對應 hook 測試中覆蓋，UI 互動流程用 e2e 驗證。

## Release

版本號與 `CHANGELOG.md` 皆由 [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) 依 Conventional Commits 自動產生，**不要**手動改 `package.json` 的 `version` 或編輯 `CHANGELOG.md`。

```bash
npm run release          # 依 commit 型別自動判斷版號（fix→patch／feat→minor／BREAKING CHANGE→視目前版本而定，見下）
npm run release:patch    # 強制升 patch
npm run release:minor    # 強制升 minor
npm run release:major    # 強制升 major
```

執行後會自動更新 `package.json` 版本號、重新產生 `CHANGELOG.md`、建立一個 `chore(release): x.y.z` commit 並打上對應的 `vX.Y.Z` git tag；`.versionrc` 定義 commit type 對應的 CHANGELOG 分類。完成後需手動 `git push --follow-tags` 推送 commit 與 tag，push 到 `main` 才會觸發下方的部署流程。

- 目前仍在 0.x 開發階段：commit 訊息帶 `!`（如 `feat!:`）或含 `BREAKING CHANGE` 只會自動跳 **minor** 版號（例如既有的 `feat(儀表板)!:` commit 造成 0.2.2 → 0.3.0），不會跳到 1.0.0；要正式跳進 1.0.0 需明確執行 `npm run release:major`。

## Deployment

`.github/workflows/deploy.yml`：push 到 `main` 會自動 typecheck → 單元測試 → build → 部署到 GitHub Pages（`actions/deploy-pages@v4`）。GitHub Pages 需為 **Public repo**（或 GitHub Pro/Team 以上）且 repo Settings → Pages → Source 設為 **GitHub Actions** 才能成功部署，否則 deploy 步驟會以 404 失敗（詳細排解步驟見 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)）。`vite.config.ts` 使用 `base: "./"` 相對路徑，因此不需因 repo 名稱而修改設定。
