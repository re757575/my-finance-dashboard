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

## 開發流程

每當要異動程式碼，依下列順序進行：

1. **從 `main` 建立新分支與 git worktree**：不直接在 `main` 上修改，改動一律在新分支對應的 worktree 內進行。
2. **實際測試資料使用 [fixtures/finance-data.json](fixtures/finance-data.json)**：手動驗證、e2e 匯入等需要真實規模資料時都用這份（見下方「測試」章節的 fixture 說明），不要使用含真實帳戶名稱或金額的個人備份。
3. **功能完成後詢問使用者是否要 commit**：不自行 commit，待使用者確認後才執行（commit 訊息見全域的 `/generating-commit-messages` 規範）。
4. **commit 完成後才關閉 worktree**：commit 前不可移除 worktree，避免遺失未提交的改動。

## Architecture

### 資料流：單一 LocalStorage 快照陣列

所有財務資料狀態的根源是 `src/hooks/useLocalSnapshots.ts`（介面主題另由 `useTheme` 管理，見下方「深色模式」），`App.tsx` 是唯一消費此 hook 的元件，其餘元件皆為受控的展示元件（透過 props 收發資料，不直接碰觸 storage）。

- **Schema**（`src/types/schema.ts`）：`FinanceData = { schemaVersion, snapshots: Snapshot[] }`，每個 `Snapshot` 以 `date`（"YYYY-MM-DD"）為顆粒度，同日覆蓋、跨日新增（見 `upsertSnapshot`）。修改 schema 時務必同步遞增 `CURRENT_SCHEMA_VERSION`（現為 8）並在 `src/lib/storage.ts` 補上 `migrateVxToVy` 遷移函式，同時串進 `migrateFinanceData` 的完整遷移鏈（現有範例：`migrateV1ToV2` ... `migrateV7ToV8`）。
- **draft vs. 已存檔資料**：`useLocalSnapshots` 內部維護 `draft`（當日編輯中的快照，未存檔前只存在於 React state）與 `financeData`（已持久化到 LocalStorage 的全部快照）。`isDirty` 用兩者的 JSON 字串比較判斷。使用者按下「更新儀表板」才會呼叫 `save()` 真正寫入 `persistFinanceData`；重新整理頁面會遺失未存檔的 draft（這是刻意行為，e2e 有覆蓋此案例）。
  - **未存檔離開提醒**：`hasUnsavedEdits` 與 `isDirty` 不同——它拿 `draft` 去比對 `baseline`（草稿最近一次由程式載入時的內容），所以「系統帶入、使用者沒動過」的今日草稿雖然 `isDirty`，卻不算未存檔編輯。只有 `hasUnsavedEdits` 為 true 時才註冊 `beforeunload`。凡是以程式取代草稿的地方都要走 `loadDraft()`（同時重設 `baseline`），不可直接 `setDraft`。
  - **寫入失敗**：`persistFinanceData` 回傳 `boolean`、不拋例外；`save`／`deleteSnapshot`／`importBackup` 寫入失敗時回 `{ ok: false, reason }` 且不更新任何 state（草稿維持未存檔，可重試）。`loadFinanceData`／`loadLastBackupAt`／`recordBackupNow` 同樣吞掉 LocalStorage 例外。
  - **多分頁同步**：監聽 `storage` 事件，其他分頁寫入後由 `syncFromStorage` 重新讀取 `financeData`；草稿沒有未存檔編輯才跟著更新，被修正的快照若已被刪除則自動離開修正模式。
  - **跨日換日**：`currentDate` 是 state 不是常數，`syncCurrentDate` 在 `visibilitychange`／`focus` 與每次 `save()` 時重新判斷今天；存檔日期一律取當下的今天。
  - **修正／刪除歷史快照**：一般狀態下表單永遠是今天；要修正過去某天，須由「歷史快照」清單進入**修正模式**（`startEditing(date)`）——此時 `draft` 載入該日快照（`editingDate` 不為 null、`draft.date` 為被修正的日期），今日草稿暫存在 hook 內的 `stashedDraftRef`（只存記憶體），`save()` 只覆蓋該日並自動 `leaveEditing()` 還原今日草稿；`isDirty` 因此是拿 `draft.date` 去比對已存檔快照，不可寫死 `currentDate`。`deleteSnapshot(date)` 只移除該日、不更新上次備份時間；兩者在 `version-mismatch` 下都會拒絕。`importBackup`／`clearAllData` 會一併重置修正模式。
- **當日表單自動帶入最近一筆資料**：`buildInitialDraft` 在當天尚無快照時，複製最近一筆快照的數值作為初始 draft（日期/時間戳改為今天）。負債清單會額外呼叫 `advanceDebtsByMonths` 依曆月差自動攤還本息、遞減剩餘期數（本息平均攤還會重算剩餘本金，只計息只減期數），並回傳 `estimatedFields` 標記哪些欄位是系統估算；使用者手動修改該筆負債的本金或期數後，`updateDebts` 會清除該筆的估算標記。
- **趨勢圖範圍**：`TrendRange = 7 | 30 | 90 | 365 | "ytd" | "all"`（選單依序為 7 天／30 天／90 天／1 年／今年以來／全部，預設 90，只存在 React state）。數字走 `getSnapshotsInRange`（最近 N 天含今天）、`"ytd"` 走 `getSnapshotsYearToDate`（今天所屬年份的 1 月 1 日起），兩者的「今天」都傳入 hook 的 `currentDate`，跨日／跨年換日後範圍跟著移動。篩選結果 `visibleSnapshots` 由趨勢圖與「複製 AI 分析提示詞」共用；歷史快照清單、快照比較、目標達成時間預估用的是全部快照（`snapshots`），不受範圍影響。趨勢圖區分頁上方的「淨資產成長率與最大回撤」摘要同樣以 `visibleSnapshots` 計算，跟著範圍連動（見下方同名小節）。新增選項時要同步改 `TrendSection.tsx` 的 `RANGE_OPTIONS`。
- **讀取狀態機**：`parseFinanceData`（`src/lib/storage.ts`）回傳 `LoadResult`（`empty` / `ok` / `corrupted` / `version-mismatch`），從不拋出例外（瀏覽器拒絕存取 LocalStorage 時 `loadFinanceData` 回 `empty`）。`version-mismatch` 時 UI 會暫停顯示與存檔功能，避免覆蓋使用者既有但版本不相容的資料——修改此邏輯要格外小心，因為它是防止資料遺失的最後防線。
- **備份／還原**（`src/lib/backup.ts`）：匯出用 Blob + `<a download>` 純前端觸發下載；匯入透過 `parseBackupFile` 走與 LocalStorage 讀取相同的 `parseFinanceData` 驗證規則。清空全部資料前，UI 層必須強制先呼叫 `exportBackup()`，`clearAllData()` 本身不做備份。
  - **加密匯出**（`src/lib/backupCrypto.ts`）：WebCrypto PBKDF2-SHA256（600,000 次）＋AES-GCM，輸出 JSON 信封（`.enc.json`，格式見 PRD 6.2 節）；`parseBackupFile(file, password?)` 偵測到信封時，未給密碼回 `encrypted`、密碼錯誤或被竄改回 `wrong-password`，解密後仍走同一個 `parseFinanceData`。密碼只經參數傳遞，絕不寫入任何儲存位置；清空前的強制備份維持明文匯出。
  - **上次備份時間**存在獨立的 LocalStorage 鍵 `my_finance_dashboard_last_backup`（`storage.ts` 的 `recordBackupNow`／`loadLastBackupAt`），不屬於快照 schema、不隨備份匯出；匯入還原不更新它，清空資料時一併清除。
  - **備份提醒與資料新鮮度**的純函式在 `src/lib/dataFreshness.ts`（`getBackupReminder` 超過 30 天提醒、`getDataFreshness` 超過 14 天標示過期，門檻為固定常數），只看已存檔快照，不看今日草稿。
- **範例資料**（`src/lib/demoData.ts`，PRD 4.2「範例資料」）：沒有任何已存檔快照時（hook 的 `canLoadDemo`；`version-mismatch` 與初次讀取完成前為 false），`DemoDataOffer` 邀請卡讓使用者一鍵載入範例資料。
  - **來源就是 [fixtures/finance-data.json](fixtures/finance-data.json)**：`loadDemoFinanceData` 以動態 `import("…?raw")` 切成獨立的同源 chunk（按下按鈕才載入、PWA 會預先快取，不發出對外請求），走同一個 `parseFinanceData`，再由 `shiftSnapshotsToDate` 把所有快照日期整體平移到最新一筆落在今天（間隔與數值不變）。
  - **範例模式標記**存在獨立的 LocalStorage 鍵 `my_finance_dashboard_demo`（`storage.ts` 的 `loadDemoMode`／`persistDemoMode`／`clearDemoMode`，皆吞掉例外），不屬於快照 schema、不隨備份匯出。hook 回傳的 `isDemo`＝有標記**且**有快照；為 true 時 `App.tsx` 顯示 `DemoDataBanner`、不顯示備份提醒橫幅，其餘功能照常。
  - **`loadDemoData()` 絕不覆蓋既有快照**：寫入前重新讀取 LocalStorage，已有快照或版本不相容一律拒絕；先寫標記再寫資料，失敗時收回標記並回 `{ ok: false, reason }`、不更新任何 state。成功後與 `importBackup` 共用 `applyReplacedData()` 重置修正模式與草稿，並把趨勢圖範圍切到 1 年（只存在 state）。
  - **結束範例模式**：橫幅的「清除範例資料」二次確認後直接呼叫 `clearAllData()`——這是「清空前必須先強制匯出」的唯一例外（虛構資料可重新載入）。`clearAllData`、`importBackup` 成功、以及 `save()` 從零筆快照開始存檔時都會清除標記；`storage` 事件會同步其他分頁的標記變化。
- **PWA**（`vite-plugin-pwa`）：`registerType: "prompt"` 只快取建置產出的同源靜態檔案，不新增任何對外網路請求，符合零伺服器傳輸原則；更新提示 UI 見 `src/components/PwaUpdatePrompt.tsx`。

### 財務計算（`src/lib/calculations.ts`）

所有數值計算集中於此檔，`calculateMetrics()` 是唯一入口，供 UI 與測試共用：

- `toSafeNumber()`：非數字或空值一律視為 0（PRD 4.2 輸入防呆規則），所有金額欄位計算前都先經過它。
- 美股市值有 `usStockCurrency: "USD" | "TWD"` 計價幣別切換：USD 時乘上 `exchangeRate` 換算成台幣，TWD 時視為使用者已填入台幣等值金額，不重複換算（`calculateTotalStockValue`）。
- 總資產 = 金融資產（現金 + 股票市值合計）+ 不動產市值（`realEstateValue`）；**金融資產**是現金比例與資產配置比例的分母（不含不動產）。現金來源可標記 `restricted`（不可動用，如期貨保證金）：仍計入總資產，但緊急預備金月數與現金比例只計 `liquidCash`（可動用現金）。
- **每月定期定額**（PRD 4.2、5.3a 節）：`recurringInvestments`（`id`／`name`／`amount`，新台幣）是把現金換成股票、**不算支出**——現金流、儲蓄率、緊急預備金月數、FIRE 建議值與達成時間預估一律不扣除它，不可把它併進 `monthlyExpense` 的計算。只多算 `totalRecurringInvestment`（`sumRecurringInvestments`）與 `cashFlowAfterInvestment`＝現金流 − 定期定額合計，合計 > 0 時由 `CashFlowIndicator` 在燈號下方並列「定期定額後剩餘」（負數加註「不足以支應」），並寫入「財務健康檢查」「投資方向評估」「負債清償策略」三種提示詞；快照比較有「每月定期定額」一組（見下方「快照比較」），沒有趨勢圖，也不納入壓力測試。輸入元件為 `RecurringInvestmentList`（比照 `IncomeSourceList`）。
- 負債比 = 總負債 / 總資產 × 100，總資產為 0 時強制為 0（避免除以零），並以 `calculateDebtRatioStatus` 分四級（`debt-free` / `healthy` / `elevated` / `high-risk`，門檻與文案見該檔）。
- **並列的三項對照指標**（PRD 5.1a、5.6、5.7 節）：都以「金融負債」＝類別不是「房貸」的負債本金合計（`sumFinancialDebtPrincipal`）為基礎，只在與原數字有差異時顯示，**原本的主數字、燈號、趨勢圖與達成時間預估一律不變**。
  - `financialDebtRatio`＝金融負債 ÷ 金融資產（金融資產 ≤ 0 為 `null`），沿用負債比四級門檻；是否顯示由 `hasSeparateFinancialDebtRatio` 判斷（有不動產或房貸），`DebtRatioBar` 與提示詞共用。
  - `savingsRateWithPrincipal`＝（現金流＋`monthlyPrincipalRepayment`）÷ 總收入，不分級；本月償還本金 > 0 才顯示。
  - `investableNetWorth`＝金融資產 − 金融負債、`investableGoalProgress`＝其 ÷ 目標淨資產；與淨資產不同才顯示。
- **償債負擔率**（PRD 5.2b 節）：`debtServiceRatio`＝本月應還款總額 ÷ 總收入 × 100（`calculateDebtServiceRatio`），應還款為 0 時為 0、總收入 ≤ 0 但有應還款時為 `null`（無法計算，畫面顯示「—」，不得出現 `NaN`／`Infinity`）；`calculateDebtServiceRatioStatus` 分五種狀態（`no-payment` 0%／`comfortable` < 30%／`heavy` 30%–40%／`excessive` > 40%／`no-income` 為 `null` 時），文案見 `DEBT_SERVICE_RATIO_STATUS_LABEL`。由 `DebtServiceRatioCard` 顯示（緊接在 `MonthlyDebtPaymentCard` 之後）並寫入「財務健康檢查」「負債清償策略」兩種提示詞；純即時計算，沒有趨勢圖，也不納入快照比較與壓力測試。
- 除負債比外，另有緊急預備金月數、儲蓄率、資產配置比例、質押整戶維持率（`calculatePledgeMaintenance`：質押類別負債的 `collateralValue` 合計 ÷ 質押本金合計，追繳線 130%）、FIRE／淨資產目標進度等多項健康指標；另有 `calculateStressScenario` 股票壓力測試（−10%／−20%／−30% 即時試算，台股／美股與質押股票市值同步下跌、現金／不動產／負債不變，不寫入任何資料，見 `StressTestCard`），計算式與分級門檻皆定義在 `calculateMetrics()` 回傳的 `CalculatedMetrics`，實作細節見該檔逐一函式與 [docs/PRD.md](docs/PRD.md) 第 5 節。
- **壓力測試臨界點**（`calculateStressBreakpoints(snapshot)`，PRD 5.9a 節）：沿用 `calculateStressScenario` 的假設，反推「股票再下跌多少 % 會碰到風險線」——質押追繳線（直接取 `pledgeDropToMarginCall`，兩者必為同一個數字）、負債比 40%／60%（`STRESS_BREAKPOINT_DEBT_RATIOS`；(總資產 − 總負債 ÷ 門檻) ÷ 股票市值）、淨資產歸零（淨資產 ÷ 股票市值）。每項狀態為 `reached`（已觸及）／`drop`（附 `dropPercent`，0 < d ≤ 100）／`unreachable`（股票跌到 0 也碰不到）；不適用的項目（無質押或未填質押股票市值、總負債為 0）不在回傳陣列內，且已依「已觸及 → 跌幅由小到大 → 不會觸及」排序。把 `dropPercent` 代回 `calculateStressScenario` 時對應指標必須剛好落在門檻上（測試有覆蓋，改任一邊的假設都要同步改另一邊）。不屬於 `CalculatedMetrics`，由 `StressTestCard` 自行呼叫後列在情境結果下方，與所選的 −10／−20／−30 情境無關，不寫入任何資料。
- **目標達成時間預估**（`calculateGoalEstimates(draft, savedSnapshots)`，PRD 5.7a 節）：以固定的每月淨資產增加額線性推算還需幾個月（`calculateGoalEta`，無條件進位，超過 `GOAL_ETA_MAX_MONTHS` 回 `too-far`、增加額 ≤ 0 回 `not-growing`）。兩種速度並列：「依目前收支」＝現金流＋本月償還的負債本金（`calculateMonthlyPrincipalRepayment`；還本金不改變淨資產，所以要加回），「依歷史變化」＝`calculateHistoricalMonthlyPace`，只看已存檔快照、取近 365 天內且相隔至少 30 天的最早一筆為起點。不屬於 `CalculatedMetrics`，由 `App.tsx` 另外計算後傳給 `GoalProgressSection`（內含 `GoalEta` 元件）。

### 快照比較（`src/lib/snapshotComparison.ts`）

`compareSnapshots(base, target)` 是純函式：兩筆快照各自經 `calculateMetrics()` 後逐項相減（對象日 − 基準日），現金來源、負債與定期定額以項目 `id` 對應（缺少的一方為 `null`、以 0 計算增減；定期定額比較的是每月投入金額，另有 `recurringInvestmentTotal` 合計列，兩筆清單皆為空時 `SnapshotComparison` 不渲染該組）；基準值 ≤ 0 時 `percent` 為 `null`，負債比的增減是百分點。負債組只比剩餘本金（質押未還本時恆為「持平」），擔保品的變化另列「質押」一組：`pledgeMaintenanceRatio`（整戶維持率，增減為百分點；任一筆為 `null`——無質押本金或未填質押股票市值——時無從比較，畫面該欄與增減皆顯示「—」，不可當成 0 相減）、`pledgeCollateralTotal` 與逐筆的 `pledgeCollaterals`（只取類別為「質押」的負債，以 `id` 對應），兩筆皆無質押負債時不渲染該組。`SnapshotComparison` 元件只比較已存檔快照（不含今日草稿），預設比較最新兩筆，不寫入任何資料。增減的呈現沿用趨勢圖共用的 `charts/DeltaText`（增加 ▲ rose、減少 ▼ emerald、相同顯示「持平」），且以畫面顯示的四捨五入後數值相減，確保表格內數字自己對得起來（PRD 4.2「快照比較」、5.10 節）。

### 淨資產成長率與最大回撤（`src/lib/netWorthPerformance.ts`）

`calculateNetWorthPerformance(snapshots)` 是獨立的純函式（比照 `snapshotComparison.ts`；不屬於 `CalculatedMetrics`、不改 schema、不寫入任何資料）：函式內自行依日期排序，每筆快照的淨資產各自經 `calculateMetrics()` 計算，少於 2 筆回傳 `null`。規格見 [docs/PRD.md](docs/PRD.md) 4.2「淨資產成長率與最大回撤」、5.11 節。

- **期間成長率** `periodReturn`＝（期末 − 期初）÷ 期初；期初 ≤ 0 為 `null`。
- **年化成長率** `annualizedReturn`＝（期末 ÷ 期初）^(`DAYS_PER_YEAR` 365.25 ÷ 天數) − 1。**首末相隔未滿 `ANNUALIZE_MIN_DAYS`（365）天不年化**（為 `null`，畫面改顯示期間成長率並註明「未滿 1 年不年化」——短期間年化會嚴重誇大）；期初 ≤ 0 或期末 < 0 也為 `null`。
- **最大回撤** `maxDrawdown`：依時間順序從「至今最高點」（須 > 0）到其後最低點的最大跌幅，回傳跌幅 %、金額、高低點日期與 `recovered`（低點之後是否有任一筆 ≥ 該高點）；從未自正的高點下跌時為 `null`。`hasUnmeasurableDecline` 標記「曾下跌但高點 ≤ 0、跌幅無從計算」，此時畫面不可寫成「沒有回撤」。
- 所有結果都經 `Number.isFinite` 把關，無法計算一律回 `null`，不會出現 `NaN`／`Infinity`。
- **資料來源是 `visibleSnapshots`**（跟著趨勢圖範圍下拉選單連動，不含今日草稿）：`NetWorthPerformance` 元件由 `TrendSection` 渲染在範圍選單之下、分頁之上，少於 2 筆時不渲染；「定期回顧報告」提示詞（`buildPeriodicReviewPrompt`）以同一個函式列出成長率與最大回撤兩行，其他提示詞模式不含。
- 增減沿用 `charts/DeltaText`（回撤以負的增減呈現為 ▼）。畫面必須保留「淨資產變化包含儲蓄投入與負債償還，不等於投資報酬率」這行說明——這不是投資績效，也沒有做現金流調整。

### AI 分析提示詞（`src/lib/promptBuilder.ts`）

`buildFinancePrompt()` 依 `PromptMode`（財務健康檢查／投資方向評估／負債清償策略／定期回顧報告／資產配置再平衡建議共 5 種）組出給外部 AI 使用的 Markdown 文字，由 `CopyPromptButton` 觸發複製到剪貼簿。全程不對外發送任何請求，使用者需自行貼到外部 AI 工具（見 [docs/PRD.md](docs/PRD.md) 4.2 節）。

### 深色模式（`src/lib/theme.ts`、`src/hooks/useTheme.ts`）

主題偏好為「跟隨系統（預設）／淺色／深色」，解析後以 `<html>` 的 `dark` class 套用（`src/index.css` 的 `@custom-variant dark` 與 shadcn 的 `.dark` CSS 變數）。規格見 [docs/PRD.md](docs/PRD.md) 4.2「深色模式」、6.2、7 節。

- **偏好儲存**：獨立的 LocalStorage 鍵 `my_finance_dashboard_theme`（`"system"`／`"light"`／`"dark"`），不屬於快照 schema、不隨備份匯出、匯入還原不影響；**「清空本地資料」也不清除它**（介面偏好不是財務資料），所以 `clearAllData()` 不可改成 `localStorage.clear()`。`loadThemePreference`／`persistThemePreference` 吞掉 LocalStorage 例外，內容不合法視為 `"system"`。
- **`useTheme`** 與 `useLocalSnapshots` 完全獨立，同樣只由 `App.tsx` 消費，再以 props 傳給頁首的 `ThemeToggle`（原生 `<select aria-label="顯示主題">`）。它監聽 `matchMedia("(prefers-color-scheme: dark)")` 的變化（跟隨系統時即時切換）與 `storage` 事件（其他分頁變更後同步）。
- **防閃爍**：`index.html` 的 `<head>` 有一段內嵌 script，在首次繪製前依偏好與系統設定加上 `dark` class。它無法 import `theme.ts`，鍵名與判斷邏輯是手動保持一致的——改其中一邊要同步改另一邊（`theme.test.ts` 會實際執行該段 script 比對兩邊結果）。同源靜態內容，不發出任何網路請求。
- **新增或修改元件時必須同時提供深色樣式**：保留淺色 class、在同一個 class 字串內緊接著補上 `dark:` 變體（淺色外觀不可因此改變）。`src/components/darkModeCoverage.test.ts` 會掃描 `App.tsx` 與業務元件，寫死的淺色 class 若沒有對應的 `dark:` 變體會直接讓測試失敗。對應規則：

  | 用途                         | 淺色                                                                         | 深色                                                                      |
  | ---------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
  | 頁面背景／卡片               | `bg-[#F9FAFB]`／`bg-white`                                                   | `dark:bg-background`／`dark:bg-card`                                      |
  | 內襯（空狀態）／軌道、灰徽章 | `bg-slate-50`／`bg-slate-100`                                                | `dark:bg-muted/50`／`dark:bg-muted`                                       |
  | 邊框、分隔線                 | `border-slate-200`、`border-slate-100`、`divide-slate-100`、`ring-slate-200` | `dark:border-border`、`dark:divide-border`、`dark:ring-border`            |
  | 原生 `<select>`              | `border-slate-200 bg-white`                                                  | `dark:border-input dark:bg-input/30`                                      |
  | 文字（由深到淺）             | `text-slate-900`／`800`／`700`／`600`／`500`／`400`                          | `dark:text-neutral-50`／`100`／`200`／`300`／`400`／`400`                 |
  | 圖表座標文字／格線／參考線   | `fill-slate-400`／`text-slate-100`／`text-slate-300`                         | `dark:fill-neutral-400`／`dark:text-neutral-800`／`dark:text-neutral-600` |
  | 狀態徽章、提示橫幅           | `bg-{色}-50` ＋ `text-{色}-700`（橫幅 `text-amber-800`）                     | `dark:bg-{色}-950` ＋ `dark:text-{色}-300`（橫幅 `dark:text-amber-200`）  |
  | 強調文字（負數、增減）       | `text-rose-600`、`text-emerald-600`、`text-amber-600`                        | `dark:text-rose-400`、`dark:text-emerald-400`、`dark:text-amber-400`      |
  | 選中的分段切換鈕             | `bg-slate-900 text-white`                                                    | `dark:bg-neutral-100 dark:text-neutral-900`                               |

  `{色}` 為 amber／rose／emerald／green／sky。進度條、燈號圓點與圖表數列的填色（`bg-*-500`、`text-*-500`、`fill-*`、資產配置色塊的 `*-600`／`slate-500`）及疊在色塊上的 `text-white` 深淺色共用，不需對應。深色下的文字下限是 `neutral-400`（`neutral-500` 在卡片上對比不足 WCAG AA）。hover 等變體寫成 `dark:hover:…`。

### 元件分層

- `src/components/*.tsx`：業務元件（輸入表單、看板卡片、趨勢區塊），大多為純展示元件，透過 `onChange`/`value` 與 `App.tsx` 溝通。
- `src/components/charts/`：手刻 SVG 圖表元件（刻意不引入 Recharts/D3 等圖表庫，見 [docs/TECH_STACK.md](docs/TECH_STACK.md) 第 3 節），`EmptyTrendCard` 處理快照筆數 < 2 時的空狀態。
- **歷史趨勢圖分組分頁**：`TrendSection` 以 `ui/tabs.tsx` 把八張趨勢圖分成「資產／負債／配置與儲蓄」三個分頁（預設「資產」），一次只渲染選取中分頁的圖表，其餘不在 DOM 中；選取的分頁只存在元件 state，不寫入 LocalStorage（PRD 4.2「趨勢圖分組分頁」）。`ui/tabs.tsx` 是依 shadcn 風格手寫的 Radix Tabs 封裝（非 `shadcn add` 生成），選取狀態以底線＋粗體標示；它用的是寫死的 slate 色階加 `dark:` 變體，且不在 `darkModeCoverage` 的掃描範圍內，調整配色時要自行對照「深色模式」一節的對應表。測試要操作非預設分頁的圖表時必須先切換分頁：e2e 用 `getByRole("tab", { name })` 點擊，Vitest 用 `fireEvent.mouseDown`（Radix 在 mousedown 而非 click 時切換）。
- `src/components/ui/`：shadcn 生成的基礎元件（Radix 封裝），走 `components.json` 的 `radix-nova` 風格設定，一般不手動修改內部實作，需要客製時優先加 wrapper 而非改動生成檔案。這些元件用語意 token（`bg-popover`、`border-input` 等），本身已支援深色。
- 路徑別名 `@/*` 對應 `src/*`（`vite.config.ts` 與 `tsconfig` 皆已設定）。

### 測試

- 單元/元件測試（Vitest + Testing Library + jsdom）與被測檔案同目錄、`*.test.ts(x)` 命名，測試環境設定在 `src/test/setup.ts`。
- e2e（Playwright，`e2e/*.spec.ts`）以 `data-testid`（如 `total-assets`、`save-button`）與 `getByRole`/`getByLabel` 定位；每個測試在 `beforeEach` 用 `page.evaluate(() => localStorage.clear())` 重置狀態（注意：故意不用 `addInitScript`，否則測試中的 `page.reload()` 也會被清空）。新增有財務語意的行為時，優先在 `calculations.test.ts` 或對應 hook 測試中覆蓋，UI 互動流程用 e2e 驗證。
- **測試資料 fixture**：[fixtures/finance-data.json](fixtures/finance-data.json) 是全部虛構（不含任何真實帳戶名稱或金額）、填滿所有功能欄位的 `FinanceData`（現為 schema v8，60 筆月底快照，含不可動用現金、美股 USD 換算、不動產、四種負債類別含質押、收入來源、月支出、每月定期定額與目標；質押本金合計始終為 1,200,000，刻意涵蓋三種狀態——最早 3 筆尚未填寫質押股票市值（比照舊版資料遷移後的狀態）、其後為單筆質押、2024-01 起拆成兩筆——供快照比較的「質押」組測試，`fixtures.test.ts` 有對應斷言），不是使用者備份檔，供 Vitest 與 Playwright 共用，**同時也是打包進正式版、使用者按「載入範例資料」會看到的範例資料**（見「範例資料」）——裡面的名稱與數字是對外可見的內容，必須維持全部虛構且看起來合理。**新增／調整功能或 schema 欄位時，必須同步更新此 JSON**（schema 升版時一併遞增 `schemaVersion`，確保 `parseFinanceData` 仍回傳 `ok`）。`e2e/fixtures/` 內的 `sample-backup.json`（舊版 v1 遷移）與 `corrupted-backup.json`（損毀）是個別情境的 e2e 專用檔，與此檔分開。
- **每次新增／修改功能後**，檢查單元/元件測試（`*.test.ts(x)`）與 `e2e/*.spec.ts` 是否需要跟著新增或調整測試案例（新元件、新看板卡片、新輸入欄位、新計算邏輯等，即使部分已有其他層級測試覆蓋，仍缺乏對應案例時要一併補上），避免功能與測試覆蓋範圍脫節。發現需要異動單元測試或 e2e 測試時，先向使用者說明本次功能異動內容並詢問是否確認無誤，待使用者確認後才動手修改測試。

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

`.github/workflows/deploy.yml`：push 到 `main` 會自動 typecheck → 單元測試 → e2e 測試 → build → 部署到 GitHub Pages（`actions/deploy-pages@v4`）。GitHub Pages 需為 **Public repo**（或 GitHub Pro/Team 以上）且 repo Settings → Pages → Source 設為 **GitHub Actions** 才能成功部署，否則 deploy 步驟會以 404 失敗（詳細排解步驟見 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)）。`vite.config.ts` 使用 `base: "./"` 相對路徑，因此不需因 repo 名稱而修改設定。
