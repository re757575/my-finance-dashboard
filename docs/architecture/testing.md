# 測試

Vitest 與 Playwright 的慣例、共用的測試資料 fixture，以及寫測試前要知道的前置動作。

- 單元/元件測試（Vitest + Testing Library + jsdom）與被測檔案同目錄、`*.test.ts(x)` 命名，測試環境設定在 `src/test/setup.ts`。
- e2e（Playwright，`e2e/*.spec.ts`）以 `data-testid`（如 `total-assets`、`save-button`）與 `getByRole`/`getByLabel` 定位；每個測試在 `beforeEach` 用 `page.evaluate(() => localStorage.clear())` 重置狀態（注意：故意不用 `addInitScript`，否則測試中的 `page.reload()` 也會被清空）。新增有財務語意的行為時，優先在 `calculations.test.ts` 或對應 hook 測試中覆蓋，UI 互動流程用 e2e 驗證。
- **型別檢查範圍**：`npm run typecheck` 除了 `src` 與 `vite.config.ts`，也透過 `tsconfig.e2e.json` 檢查 `e2e/**/*.ts`、`playwright.config.ts` 與 `scripts/` 內以 JSDoc 標註型別的 `.mjs`（Playwright 與 Node 執行時只轉譯或直接執行、不檢查型別），因此這些檔案的型別錯誤同樣會被 pre-commit 與 CI 擋下。
- **測試資料 fixture**：[fixtures/finance-data.json](../../fixtures/finance-data.json) 是全部虛構（不含任何真實帳戶名稱或金額）、填滿所有功能欄位的 `FinanceData`（現為 schema v9，60 筆月底快照，含不可動用現金、美股 USD 換算、不動產、四種負債類別含質押、收入來源、月支出、每月定期定額、目標與其中 6 筆的快照備註；質押本金合計始終為 1,200,000，刻意涵蓋三種狀態——最早 3 筆尚未填寫質押股票市值（比照舊版資料遷移後的狀態）、其後為單筆質押、2024-01 起拆成兩筆——供快照比較的「質押」組測試，`fixtures.test.ts` 有對應斷言），不是使用者備份檔，供 Vitest 與 Playwright 共用，**同時也是打包進正式版、使用者按「載入範例資料」會看到的範例資料**（見 [backup-and-demo.md](backup-and-demo.md)「範例資料」）——裡面的名稱與數字是對外可見的內容，必須維持全部虛構且看起來合理。**新增／調整功能或 schema 欄位時，必須同步更新此 JSON**（schema 升版時一併遞增 `schemaVersion`，確保 `parseFinanceData` 仍回傳 `ok`）。`e2e/fixtures/` 內的 `sample-backup.json`（舊版 v1 遷移）與 `corrupted-backup.json`（損毀）是個別情境的 e2e 專用檔，與此檔分開。
- **種子資料由目前的 schema 產生**：單元測試以 `createEmptySnapshot(date)` 展開後只覆寫需要的欄位，版本號用 `CURRENT_SCHEMA_VERSION`；e2e 用 `e2e/helpers.ts` 的 `makeSnapshot`（同樣由 `createEmptySnapshot` 展開）、`seedFinanceData`／`writeFinanceData`（寫入 LocalStorage，前者會重新整理頁面）、`dateDaysAgo` 與 `STORAGE_KEY`。schema 新增欄位或升版時，這些測試不必跟著改。只有刻意測舊版資料遷移的案例才寫死版本號與該版本的完整欄位。
- **文件的指標由測試把關**：`src/test/docsIntegrity.test.ts` 檢查 `CLAUDE.md`、`README.md` 與 `docs/` 下所有 Markdown 的相對連結都指向存在的檔案或目錄（去掉 `#錨點` 後判斷；外部連結、純錨點與圍欄式程式碼區塊內的連結不檢查）、`CLAUDE.md` 不超過 8192 位元組（超過時把架構細節移到 `docs/architecture/`，`CLAUDE.md` 只留連結），以及 `src/`、`e2e/`、`scripts/` 的註解與字串裡提到的 `docs/….md` 路徑都存在。搬移或改名文件後，失敗訊息會以「檔案:行號 → 連結」列出要修的地方。
- **操作收合區塊或非預設分頁前要先展開／切換**，否則「不存在」的斷言必定通過：輸入區見 [layout.md](layout.md)「輸入區分段收合與總覽卡增減」，快照比較、歷史快照與趨勢圖分頁見 [components.md](components.md)。
