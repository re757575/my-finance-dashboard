import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AssetAllocationBar } from "@/components/AssetAllocationBar";
import { BackupReminderBanner } from "@/components/BackupReminderBanner";
import { CashFlowIndicator } from "@/components/CashFlowIndicator";
import { CashRatioCard } from "@/components/CashRatioCard";
import { CashSourceList } from "@/components/CashSourceList";
import { CopyPromptButton } from "@/components/CopyPromptButton";
import { DataFreshnessNotice } from "@/components/DataFreshnessNotice";
import { DataManagement } from "@/components/DataManagement";
import { DebtList } from "@/components/DebtList";
import { DebtRatioBar } from "@/components/DebtRatioBar";
import { DebtServiceRatioCard } from "@/components/DebtServiceRatioCard";
import { DemoDataBanner } from "@/components/DemoDataBanner";
import { DemoDataOffer } from "@/components/DemoDataOffer";
import { EmergencyFundCard } from "@/components/EmergencyFundCard";
import { ExpenseInput } from "@/components/ExpenseInput";
import { Footer } from "@/components/Footer";
import { GoalProgressSection } from "@/components/GoalProgressSection";
import { IncomeSourceList } from "@/components/IncomeSourceList";
import { MonthlyDebtPaymentCard } from "@/components/MonthlyDebtPaymentCard";
import { PledgeMaintenanceCard } from "@/components/PledgeMaintenanceCard";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";
import { RealEstateInput } from "@/components/RealEstateInput";
import { RecurringInvestmentList } from "@/components/RecurringInvestmentList";
import { SavingsRateCard } from "@/components/SavingsRateCard";
import { SnapshotComparison } from "@/components/SnapshotComparison";
import { SnapshotEditBanner } from "@/components/SnapshotEditBanner";
import { SnapshotHistory } from "@/components/SnapshotHistory";
import { StickySaveBar } from "@/components/StickySaveBar";
import { StockInputs } from "@/components/StockInputs";
import { StressTestCard } from "@/components/StressTestCard";
import { SummaryCards } from "@/components/SummaryCards";
import { TargetCashRatioInput } from "@/components/TargetCashRatioInput";
import { TargetNetWorthInput } from "@/components/TargetNetWorthInput";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TrendSection } from "@/components/TrendSection";
import { Button } from "@/components/ui/button";
import { useLocalSnapshots } from "@/hooks/useLocalSnapshots";
import { SINGLE_COLUMN_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useTheme } from "@/hooks/useTheme";
import { calculateGoalEstimates } from "@/lib/calculations";
import { getBackupReminder, getDataFreshness } from "@/lib/dataFreshness";
import { getCurrentDate } from "@/lib/storage";

function App() {
  const {
    currentDate,
    hasLoaded,
    loadStatus,
    draft,
    metrics,
    isDirty,
    hasUnsavedEdits,
    updateDraft,
    estimatedDebtFields,
    updateDebts,
    save,
    editingDate,
    startEditing,
    cancelEditing,
    deleteSnapshot,
    snapshots,
    exportBackup,
    exportEncryptedBackup,
    importBackup,
    clearAllData,
    isDemo,
    canLoadDemo,
    loadDemoData,
    lastBackupAt,
    earliestSnapshotDate,
    latestSnapshotDate,
    snapshotCount,
    visibleSnapshots,
    trendRange,
    setTrendRange,
  } = useLocalSnapshots();

  // 介面主題（PRD 4.2「深色模式」）：獨立於快照資料，不受匯入還原、清空本地資料影響
  const { preference: themePreference, setPreference: setThemePreference } =
    useTheme();

  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // 單欄版面（PRD 第 7 節）：已有快照時看板排在輸入區之前（回訪多半先看結果），
  // 還沒有任何快照時維持輸入區在前（一片 $0 的看板沒有意義）。
  // 直接調整 DOM 順序而非 CSS order，鍵盤與螢幕閱讀器的順序才會與畫面一致；雙欄版面不受影響。
  const isSingleColumn = useMediaQuery(SINGLE_COLUMN_QUERY);
  const dashboardFirst = isSingleColumn && snapshotCount > 0;
  const formRef = useRef<HTMLDivElement>(null);

  // 看板與輸入區對調（存下第一筆快照、匯入、清空等）時，原本的捲動位置會落在不相干的內容上，回到頁面頂端。
  // 初次讀取 LocalStorage 造成的那一次不算，以免蓋掉瀏覽器還原的捲動位置。
  const previousDashboardFirst = useRef<boolean | null>(null);
  useEffect(() => {
    if (!hasLoaded) return;
    const previous = previousDashboardFirst.current;
    previousDashboardFirst.current = dashboardFirst;
    if (previous !== null && previous !== dashboardFirst && isSingleColumn) {
      window.scrollTo?.({ top: 0 });
    }
  }, [hasLoaded, dashboardFirst, isSingleColumn]);

  // 固定儲存列只在「使用者動過、而且存得下去」時出現：系統帶入的今日草稿（isDirty 但沒動過）
  // 與修正模式下只有暫存的今日草稿有編輯（存檔鈕無事可做）都不算。
  const canSaveEdits = isDirty && hasUnsavedEdits;
  const showStickyBar =
    isSingleColumn && (canSaveEdits || saveMessage !== null);

  // 目標達成時間預估（PRD 5.7a）：收支取自表單，歷史速度只看已存檔快照
  const goalEstimates = useMemo(
    () => calculateGoalEstimates(draft, snapshots),
    [draft, snapshots]
  );

  // 資料新鮮度與備份提醒（PRD 4.2）：只看已存檔快照，與今日草稿是否有未存檔異動無關
  const freshness = getDataFreshness(latestSnapshotDate, currentDate);
  const backupReminder = getBackupReminder({
    lastBackupDate: lastBackupAt
      ? getCurrentDate(new Date(lastBackupAt))
      : null,
    earliestSnapshotDate,
    currentDate,
  });

  function showMessage(message: string) {
    setSaveMessage(message);
    window.setTimeout(() => setSaveMessage(null), 4000);
  }

  function handleSave() {
    // 修正模式下儲存後會離開修正模式，需在呼叫 save() 前記下被修正的日期
    const correctedDate = editingDate;
    const result = save();
    if (!result.ok) {
      showMessage(result.reason ?? "儲存失敗");
      return;
    }
    showMessage(
      correctedDate
        ? `已更新 ${correctedDate} 的快照。`
        : "已更新並儲存今日資料。"
    );
  }

  function handleEdit(date: string) {
    // 先讓表單換成該日快照並完成排版再捲動：捲動途中版面高度若還在變，平滑捲動會被瀏覽器中斷
    flushSync(() => startEditing(date));
    // 讓使用者看見輸入區與修正橫幅；單欄版面的輸入區不一定在頁面頂端
    if (isSingleColumn) scrollToForm();
    else window.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  function scrollToForm() {
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function handleDelete(date: string) {
    const result = deleteSnapshot(date);
    showMessage(
      result.ok ? `已刪除 ${date} 的快照。` : (result.reason ?? "刪除失敗")
    );
  }

  // 輸入區（雙欄版面的左欄）
  const inputForm = (
    <div
      key="form"
      ref={formRef}
      data-testid="input-form"
      className="scroll-mt-4 space-y-4 rounded-xl bg-white dark:bg-card p-4 shadow-sm lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start"
    >
      <SnapshotEditBanner date={editingDate} onCancel={cancelEditing} />
      <CashSourceList
        value={draft.cashSources}
        onChange={(cashSources) => updateDraft({ cashSources })}
      />
      <StockInputs
        twStockValue={draft.twStockValue}
        usStockValue={draft.usStockValue}
        usStockCurrency={draft.usStockCurrency}
        exchangeRate={draft.exchangeRate}
        onChange={updateDraft}
      />
      <RealEstateInput
        value={draft.realEstateValue}
        onChange={(realEstateValue) => updateDraft({ realEstateValue })}
      />
      <DebtList
        value={draft.debts}
        onChange={updateDebts}
        estimatedFields={estimatedDebtFields}
      />
      <IncomeSourceList
        value={draft.incomeSources}
        onChange={(incomeSources) => updateDraft({ incomeSources })}
      />
      <ExpenseInput
        value={draft.monthlyExpense}
        onChange={(monthlyExpense) => updateDraft({ monthlyExpense })}
      />
      <RecurringInvestmentList
        value={draft.recurringInvestments}
        onChange={(recurringInvestments) =>
          updateDraft({ recurringInvestments })
        }
      />
      <TargetNetWorthInput
        value={draft.targetNetWorth}
        monthlyExpense={draft.monthlyExpense}
        onChange={(targetNetWorth) => updateDraft({ targetNetWorth })}
      />
      <TargetCashRatioInput
        value={draft.targetCashRatio}
        onChange={(targetCashRatio) => updateDraft({ targetCashRatio })}
      />

      <div className="space-y-1">
        <Button
          type="button"
          data-testid="save-button"
          className="w-full"
          onClick={handleSave}
          disabled={!isDirty}
        >
          {editingDate
            ? `儲存修正${isDirty ? "" : "（尚未修改）"}`
            : `更新儀表板${isDirty ? "" : "（已是最新）"}`}
        </Button>
        {saveMessage && (
          <p
            data-testid="save-message"
            className="text-center text-xs text-slate-500 dark:text-neutral-400"
          >
            {saveMessage}
          </p>
        )}
      </div>

      <DataManagement
        onExport={exportBackup}
        onExportEncrypted={exportEncryptedBackup}
        onImport={importBackup}
        backupStatus={{ lastBackupAt, currentDate }}
        onClearConfirmed={clearAllData}
      />
    </div>
  );

  // 當下看板（雙欄版面的右欄上半）
  const dashboardNow = (
    <section
      key="dashboard"
      data-testid="dashboard-now"
      className="space-y-3 lg:col-span-2 lg:col-start-2 lg:row-start-1"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* 單欄且看板在前時，輸入區在一長串卡片之後，提供捷徑 */}
        {dashboardFirst && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="jump-to-form"
            onClick={scrollToForm}
          >
            ↓ 前往輸入區
          </Button>
        )}
        <div className="ml-auto">
          <CopyPromptButton
            currentDate={currentDate}
            draft={draft}
            metrics={metrics}
            recentSnapshots={visibleSnapshots}
            disabled={snapshotCount === 0 || editingDate !== null}
          />
        </div>
      </div>
      <SummaryCards metrics={metrics} debts={draft.debts} />
      {/* 手機（360–639px）兩欄並排：第一張「負債比」內容較多、獨佔一列；其餘成對排列，落單的最後一張補滿整列 */}
      <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3 xs:max-sm:[&>*:first-child]:col-span-2 xs:max-sm:[&>*:last-child:nth-child(even)]:col-span-2">
        <DebtRatioBar
          ratio={metrics.debtRatio}
          status={metrics.debtRatioStatus}
          totalLiabilities={metrics.totalLiabilities}
          totalAssets={metrics.totalAssets}
          financialRatio={metrics.financialDebtRatio}
          financialStatus={metrics.financialDebtRatioStatus}
          financialLiabilities={metrics.financialLiabilities}
          financialAssets={metrics.financialAssets}
        />
        <CashRatioCard
          ratio={metrics.cashRatio}
          liquidCash={metrics.liquidCash}
          financialAssets={metrics.financialAssets}
        />
        <CashFlowIndicator
          cashFlow={metrics.cashFlow}
          totalIncome={metrics.totalIncome}
          monthlyExpense={draft.monthlyExpense}
          totalMonthlyDebtPayment={metrics.totalMonthlyDebtPayment}
          recurringInvestment={metrics.totalRecurringInvestment}
          cashFlowAfterInvestment={metrics.cashFlowAfterInvestment}
        />
        <MonthlyDebtPaymentCard
          amount={metrics.totalMonthlyDebtPayment}
          debts={draft.debts}
        />
        <DebtServiceRatioCard
          ratio={metrics.debtServiceRatio}
          status={metrics.debtServiceRatioStatus}
          totalMonthlyDebtPayment={metrics.totalMonthlyDebtPayment}
          totalIncome={metrics.totalIncome}
        />
        <EmergencyFundCard
          months={metrics.emergencyFundMonths}
          status={metrics.emergencyFundStatus}
          liquidCash={metrics.liquidCash}
          restrictedCash={metrics.restrictedCash}
          monthlyExpense={draft.monthlyExpense}
          totalMonthlyDebtPayment={metrics.totalMonthlyDebtPayment}
        />
        <SavingsRateCard
          rate={metrics.savingsRate}
          status={metrics.savingsRateStatus}
          cashFlow={metrics.cashFlow}
          totalIncome={metrics.totalIncome}
          principalRepayment={metrics.monthlyPrincipalRepayment}
          rateWithPrincipal={metrics.savingsRateWithPrincipal}
        />
        <PledgeMaintenanceCard
          ratio={metrics.pledgeMaintenanceRatio}
          status={metrics.pledgeMaintenanceStatus}
          pledgePrincipal={metrics.pledgePrincipal}
          pledgeCollateralValue={metrics.pledgeCollateralValue}
          dropToMarginCall={metrics.pledgeDropToMarginCall}
        />
      </div>
    </section>
  );

  return (
    <div className="min-h-svh bg-[#F9FAFB] dark:bg-background">
      <div
        className={`mx-auto max-w-6xl px-4 pt-8 ${showStickyBar ? "pb-28" : "pb-8"}`}
      >
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-neutral-50">
                個人資產負債儀表板
              </h1>
              <p className="text-sm text-slate-500 dark:text-neutral-400">
                目前檢視日期：{currentDate}
              </p>
            </div>
            <ThemeToggle
              value={themePreference}
              onChange={setThemePreference}
            />
          </div>
          <DataFreshnessNotice freshness={freshness} />
        </header>

        {/* 範例模式下不提醒備份：虛構資料不需要備份（PRD 4.2「範例資料」） */}
        {!isDemo && <BackupReminderBanner reminder={backupReminder} />}

        {loadStatus === "corrupted" && (
          <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-800 dark:text-amber-200">
            本地資料無法讀取，已重置。請重新輸入本月資料。
          </div>
        )}
        {loadStatus === "version-mismatch" && (
          <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-800 dark:text-amber-200">
            偵測到本地資料版本不相容，為避免覆蓋既有資料，暫停顯示與存檔功能。
          </div>
        )}
        {canLoadDemo && <DemoDataOffer onLoad={loadDemoData} />}
        {isDemo && <DemoDataBanner onExit={clearAllData} />}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:grid-rows-[auto_1fr]">
          {dashboardFirst
            ? [dashboardNow, inputForm]
            : [inputForm, dashboardNow]}

          {/* 右欄下半：配置、試算、目標與歷史 */}
          <div className="space-y-6 lg:col-span-2 lg:col-start-2 lg:row-start-2">
            <AssetAllocationBar
              cashRatio={metrics.cashRatio}
              restrictedCashRatio={metrics.restrictedCashRatio}
              twStockRatio={metrics.twStockRatio}
              usStockRatio={metrics.usStockRatio}
              financialAssets={metrics.financialAssets}
              liquidCash={metrics.liquidCash}
              restrictedCash={metrics.restrictedCash}
              twStockValue={metrics.twStockValue}
              usStockValueInTwd={metrics.usStockValueInTwd}
              realEstateValue={metrics.realEstateValue}
            />

            <StressTestCard snapshot={draft} />

            <GoalProgressSection
              netWorth={metrics.netWorth}
              targetNetWorth={draft.targetNetWorth}
              monthlyExpense={draft.monthlyExpense}
              progress={metrics.goalProgress}
              investableNetWorth={metrics.investableNetWorth}
              investableProgress={metrics.investableGoalProgress}
              estimates={goalEstimates}
              onSetTarget={(targetNetWorth) => updateDraft({ targetNetWorth })}
            />

            <TrendSection
              visibleSnapshots={visibleSnapshots}
              snapshotCount={snapshotCount}
              trendRange={trendRange}
              onRangeChange={setTrendRange}
              targetNetWorth={draft.targetNetWorth}
            />

            <SnapshotComparison snapshots={snapshots} />

            <SnapshotHistory
              snapshots={snapshots}
              currentDate={currentDate}
              editingDate={editingDate}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          </div>
        </div>

        <Footer />
      </div>
      {isSingleColumn && (
        <StickySaveBar
          hasUnsavedEdits={canSaveEdits}
          editingDate={editingDate}
          message={saveMessage}
          onSave={handleSave}
        />
      )}
      <PwaUpdatePrompt aboveStickyBar={showStickyBar} />
    </div>
  );
}

export default App;
