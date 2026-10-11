# 財務計算、快照比較與 AI 提示詞

所有由快照推算數字的純函式。公式定義以 [docs/PRD.md](../PRD.md) 第 5 節為準，這裡記的是程式結構與容易改錯的地方。

## 財務計算（`src/lib/calculations.ts`）

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
- 除負債比外，另有緊急預備金月數、儲蓄率、資產配置比例、質押整戶維持率（`calculatePledgeMaintenance`：質押類別負債的 `collateralValue` 合計 ÷ 質押本金合計，追繳線 130%）、FIRE／淨資產目標進度等多項健康指標；另有 `calculateStressScenario` 股票壓力測試（−10%／−20%／−30% 一鍵情境或「自訂」0–100% 跌幅的即時試算，台股／美股與質押股票市值同步下跌、現金／不動產／負債不變，不寫入任何資料，見 `StressTestCard`；跌幅在函式內一律夾在 0–`STRESS_TEST_MAX_DROP`，非數字視為 0。所選情境與自訂值只存在元件 state，第一次選「自訂」時沿用當下的固定情境，輸入框走 `useNumberInputText` 的 `max`），計算式與分級門檻皆定義在 `calculateMetrics()` 回傳的 `CalculatedMetrics`，實作細節見該檔逐一函式與 [docs/PRD.md](../PRD.md) 第 5 節。
- **壓力測試臨界點**（`calculateStressBreakpoints(snapshot)`，PRD 5.9a 節）：沿用 `calculateStressScenario` 的假設，反推「股票再下跌多少 % 會碰到風險線」——質押追繳線（直接取 `pledgeDropToMarginCall`，兩者必為同一個數字）、負債比 40%／60%（`STRESS_BREAKPOINT_DEBT_RATIOS`；(總資產 − 總負債 ÷ 門檻) ÷ 股票市值）、淨資產歸零（淨資產 ÷ 股票市值）。每項狀態為 `reached`（已觸及）／`drop`（附 `dropPercent`，0 < d ≤ 100）／`unreachable`（股票跌到 0 也碰不到）；不適用的項目（無質押或未填質押股票市值、總負債為 0）不在回傳陣列內，且已依「已觸及 → 跌幅由小到大 → 不會觸及」排序。把 `dropPercent` 代回 `calculateStressScenario` 時對應指標必須剛好落在門檻上（測試有覆蓋，改任一邊的假設都要同步改另一邊）。不屬於 `CalculatedMetrics`，由 `StressTestCard` 自行呼叫後列在情境結果下方，與所選的情境（含自訂跌幅）無關，不寫入任何資料。
- **目標達成時間預估**（`calculateGoalEstimates(draft, savedSnapshots)`，PRD 5.7a 節）：以固定的每月淨資產增加額線性推算還需幾個月（`calculateGoalEta`，無條件進位，超過 `GOAL_ETA_MAX_MONTHS` 回 `too-far`、增加額 ≤ 0 回 `not-growing`）。兩種速度並列：「依目前收支」＝現金流＋本月償還的負債本金（`calculateMonthlyPrincipalRepayment`；還本金不改變淨資產，所以要加回），「依歷史變化」＝`calculateHistoricalMonthlyPace`，只看已存檔快照、取近 365 天內且相隔至少 30 天的最早一筆為起點。不屬於 `CalculatedMetrics`，由 `App.tsx` 另外計算後傳給 `GoalProgressSection`（內含 `GoalEta` 元件）。

## 快照比較（`src/lib/snapshotComparison.ts`）

`compareSnapshots(base, target)` 是純函式：兩筆快照各自經 `calculateMetrics()` 後逐項相減（對象日 − 基準日），現金來源、負債與定期定額以項目 `id` 對應（缺少的一方為 `null`、以 0 計算增減；定期定額比較的是每月投入金額，另有 `recurringInvestmentTotal` 合計列，兩筆清單皆為空時 `SnapshotComparison` 不渲染該組）；基準值 ≤ 0 時 `percent` 為 `null`，負債比的增減是百分點。負債組只比剩餘本金（質押未還本時恆為「持平」），擔保品的變化另列「質押」一組：`pledgeMaintenanceRatio`（整戶維持率，增減為百分點；任一筆為 `null`——無質押本金或未填質押股票市值——時無從比較，畫面該欄與增減皆顯示「—」，不可當成 0 相減）、`pledgeCollateralTotal` 與逐筆的 `pledgeCollaterals`（只取類別為「質押」的負債，以 `id` 對應），兩筆皆無質押負債時不渲染該組。`SnapshotComparison` 元件只比較已存檔快照（不含今日草稿），預設比較最新兩筆，不寫入任何資料。增減的呈現沿用趨勢圖共用的 `charts/DeltaText`（增加 ▲ rose、減少 ▼ emerald、相同顯示「持平」），且以畫面顯示的四捨五入後數值相減，確保表格內數字自己對得起來（PRD 4.2「快照比較」、5.10 節）。

## 淨資產成長率與最大回撤（`src/lib/netWorthPerformance.ts`）

`calculateNetWorthPerformance(snapshots)` 是獨立的純函式（比照 `snapshotComparison.ts`；不屬於 `CalculatedMetrics`、不改 schema、不寫入任何資料）：函式內自行依日期排序，每筆快照的淨資產各自經 `calculateMetrics()` 計算，少於 2 筆回傳 `null`。規格見 [docs/PRD.md](../PRD.md) 4.2「淨資產成長率與最大回撤」、5.11 節。

- **期間成長率** `periodReturn`＝（期末 − 期初）÷ 期初；期初 ≤ 0 為 `null`。
- **年化成長率** `annualizedReturn`＝（期末 ÷ 期初）^(`DAYS_PER_YEAR` 365.25 ÷ 天數) − 1。**首末相隔未滿 `ANNUALIZE_MIN_DAYS`（365）天不年化**（為 `null`，畫面改顯示期間成長率並註明「未滿 1 年不年化」——短期間年化會嚴重誇大）；期初 ≤ 0 或期末 < 0 也為 `null`。
- **最大回撤** `maxDrawdown`：依時間順序從「至今最高點」（須 > 0）到其後最低點的最大跌幅，回傳跌幅 %、金額、高低點日期與 `recovered`（低點之後是否有任一筆 ≥ 該高點）；從未自正的高點下跌時為 `null`。`hasUnmeasurableDecline` 標記「曾下跌但高點 ≤ 0、跌幅無從計算」，此時畫面不可寫成「沒有回撤」。
- 所有結果都經 `Number.isFinite` 把關，無法計算一律回 `null`，不會出現 `NaN`／`Infinity`。
- **資料來源是 `visibleSnapshots`**（跟著趨勢圖範圍下拉選單連動，不含今日草稿）：`NetWorthPerformance` 元件由 `TrendSection` 渲染在範圍選單之下、分頁之上，少於 2 筆時不渲染；「定期回顧報告」提示詞（`buildPeriodicReviewPrompt`）以同一個函式列出成長率與最大回撤兩行，其他提示詞模式不含。
- 增減沿用 `charts/DeltaText`（回撤以負的增減呈現為 ▼）。畫面必須保留「淨資產變化包含儲蓄投入與負債償還，不等於投資報酬率」這行說明——這不是投資績效，也沒有做現金流調整。

## AI 分析提示詞（`src/lib/promptBuilder.ts`）

`buildFinancePrompt()` 依 `PromptMode`（財務健康檢查／投資方向評估／負債清償策略／定期回顧報告／資產配置再平衡建議共 5 種）組出給外部 AI 使用的 Markdown 文字，由 `CopyPromptButton` 觸發複製到剪貼簿。全程不對外發送任何請求，使用者需自行貼到外部 AI 工具（見 [docs/PRD.md](../PRD.md) 4.2 節）。
