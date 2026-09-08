import { useState } from "react";
import { AssetAllocationBar } from "@/components/AssetAllocationBar";
import { CashFlowIndicator } from "@/components/CashFlowIndicator";
import { CashRatioCard } from "@/components/CashRatioCard";
import { CashSourceList } from "@/components/CashSourceList";
import { CopyPromptButton } from "@/components/CopyPromptButton";
import { DataManagement } from "@/components/DataManagement";
import { DebtList } from "@/components/DebtList";
import { DebtRatioBar } from "@/components/DebtRatioBar";
import { EmergencyFundCard } from "@/components/EmergencyFundCard";
import { ExpenseInput } from "@/components/ExpenseInput";
import { Footer } from "@/components/Footer";
import { GoalProgressSection } from "@/components/GoalProgressSection";
import { IncomeSourceList } from "@/components/IncomeSourceList";
import { MonthlyDebtPaymentCard } from "@/components/MonthlyDebtPaymentCard";
import { SavingsRateCard } from "@/components/SavingsRateCard";
import { StockInputs } from "@/components/StockInputs";
import { SummaryCards } from "@/components/SummaryCards";
import { TargetCashRatioInput } from "@/components/TargetCashRatioInput";
import { TargetNetWorthInput } from "@/components/TargetNetWorthInput";
import { TrendSection } from "@/components/TrendSection";
import { Button } from "@/components/ui/button";
import { useLocalSnapshots } from "@/hooks/useLocalSnapshots";

function App() {
  const {
    currentDate,
    loadStatus,
    draft,
    metrics,
    isDirty,
    updateDraft,
    estimatedDebtFields,
    updateDebts,
    save,
    exportBackup,
    importBackup,
    clearAllData,
    snapshotCount,
    visibleSnapshots,
    trendRange,
    setTrendRange,
  } = useLocalSnapshots();

  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  function handleSave() {
    const result = save();
    setSaveMessage(
      result.ok ? "已更新並儲存今日資料。" : (result.reason ?? "儲存失敗")
    );
    window.setTimeout(() => setSaveMessage(null), 4000);
  }

  return (
    <div className="min-h-svh bg-[#F9FAFB]">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">
            個人資產負債儀表板
          </h1>
          <p className="text-sm text-slate-500">目前檢視日期：{currentDate}</p>
        </header>

        {loadStatus === "corrupted" && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            本地資料無法讀取，已重置。請重新輸入本月資料。
          </div>
        )}
        {loadStatus === "version-mismatch" && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            偵測到本地資料版本不相容，為避免覆蓋既有資料，暫停顯示與存檔功能。
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* 左欄：輸入區 */}
          <div className="space-y-4 rounded-xl bg-white p-4 shadow-sm md:col-span-1 md:self-start">
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
                更新儀表板{isDirty ? "" : "（已是最新）"}
              </Button>
              {saveMessage && (
                <p
                  data-testid="save-message"
                  className="text-center text-xs text-slate-500"
                >
                  {saveMessage}
                </p>
              )}
            </div>

            <DataManagement
              onExport={exportBackup}
              onImport={importBackup}
              onClearConfirmed={clearAllData}
            />
          </div>

          {/* 右欄：看板與趨勢 */}
          <div className="space-y-6 md:col-span-2">
            <section className="space-y-3">
              <div className="flex justify-end">
                <CopyPromptButton
                  currentDate={currentDate}
                  draft={draft}
                  metrics={metrics}
                  recentSnapshots={visibleSnapshots}
                  disabled={snapshotCount === 0}
                />
              </div>
              <SummaryCards metrics={metrics} debts={draft.debts} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DebtRatioBar
                  ratio={metrics.debtRatio}
                  status={metrics.debtRatioStatus}
                  totalLiabilities={metrics.totalLiabilities}
                  totalAssets={metrics.totalAssets}
                />
                <CashRatioCard
                  ratio={metrics.cashRatio}
                  totalCash={metrics.totalCash}
                  totalAssets={metrics.totalAssets}
                />
                <CashFlowIndicator
                  cashFlow={metrics.cashFlow}
                  totalIncome={metrics.totalIncome}
                  monthlyExpense={draft.monthlyExpense}
                  totalMonthlyDebtPayment={metrics.totalMonthlyDebtPayment}
                />
                <MonthlyDebtPaymentCard
                  amount={metrics.totalMonthlyDebtPayment}
                  debts={draft.debts}
                />
                <EmergencyFundCard
                  months={metrics.emergencyFundMonths}
                  status={metrics.emergencyFundStatus}
                  totalCash={metrics.totalCash}
                  monthlyExpense={draft.monthlyExpense}
                  totalMonthlyDebtPayment={metrics.totalMonthlyDebtPayment}
                />
                <SavingsRateCard
                  rate={metrics.savingsRate}
                  status={metrics.savingsRateStatus}
                  cashFlow={metrics.cashFlow}
                  totalIncome={metrics.totalIncome}
                />
              </div>
            </section>

            <AssetAllocationBar
              cashRatio={metrics.cashRatio}
              twStockRatio={metrics.twStockRatio}
              usStockRatio={metrics.usStockRatio}
              totalAssets={metrics.totalAssets}
              totalCash={metrics.totalCash}
              twStockValue={metrics.twStockValue}
              usStockValueInTwd={metrics.usStockValueInTwd}
            />

            <GoalProgressSection
              netWorth={metrics.netWorth}
              targetNetWorth={draft.targetNetWorth}
              monthlyExpense={draft.monthlyExpense}
              progress={metrics.goalProgress}
              onSetTarget={(targetNetWorth) => updateDraft({ targetNetWorth })}
            />

            <TrendSection
              visibleSnapshots={visibleSnapshots}
              snapshotCount={snapshotCount}
              trendRange={trendRange}
              onRangeChange={setTrendRange}
            />
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

export default App;
