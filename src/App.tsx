import { useState } from "react";
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
import { EmergencyFundCard } from "@/components/EmergencyFundCard";
import { ExpenseInput } from "@/components/ExpenseInput";
import { Footer } from "@/components/Footer";
import { GoalProgressSection } from "@/components/GoalProgressSection";
import { IncomeSourceList } from "@/components/IncomeSourceList";
import { MonthlyDebtPaymentCard } from "@/components/MonthlyDebtPaymentCard";
import { PledgeMaintenanceCard } from "@/components/PledgeMaintenanceCard";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";
import { RealEstateInput } from "@/components/RealEstateInput";
import { SavingsRateCard } from "@/components/SavingsRateCard";
import { SnapshotComparison } from "@/components/SnapshotComparison";
import { SnapshotEditBanner } from "@/components/SnapshotEditBanner";
import { SnapshotHistory } from "@/components/SnapshotHistory";
import { StockInputs } from "@/components/StockInputs";
import { StressTestCard } from "@/components/StressTestCard";
import { SummaryCards } from "@/components/SummaryCards";
import { TargetCashRatioInput } from "@/components/TargetCashRatioInput";
import { TargetNetWorthInput } from "@/components/TargetNetWorthInput";
import { TrendSection } from "@/components/TrendSection";
import { Button } from "@/components/ui/button";
import { useLocalSnapshots } from "@/hooks/useLocalSnapshots";
import { getBackupReminder, getDataFreshness } from "@/lib/dataFreshness";
import { getCurrentDate } from "@/lib/storage";

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
    editingDate,
    startEditing,
    cancelEditing,
    deleteSnapshot,
    snapshots,
    exportBackup,
    exportEncryptedBackup,
    importBackup,
    clearAllData,
    lastBackupAt,
    earliestSnapshotDate,
    latestSnapshotDate,
    snapshotCount,
    visibleSnapshots,
    trendRange,
    setTrendRange,
  } = useLocalSnapshots();

  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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
    startEditing(date);
    // 讓使用者看見左欄表單與修正橫幅
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  function handleDelete(date: string) {
    const result = deleteSnapshot(date);
    showMessage(
      result.ok ? `已刪除 ${date} 的快照。` : (result.reason ?? "刪除失敗")
    );
  }

  return (
    <div className="min-h-svh bg-[#F9FAFB]">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">
            個人資產負債儀表板
          </h1>
          <p className="text-sm text-slate-500">目前檢視日期：{currentDate}</p>
          <DataFreshnessNotice freshness={freshness} />
        </header>

        <BackupReminderBanner reminder={backupReminder} />

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
                  className="text-center text-xs text-slate-500"
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

          {/* 右欄：看板與趨勢 */}
          <div className="space-y-6 md:col-span-2">
            <section className="space-y-3">
              <div className="flex justify-end">
                <CopyPromptButton
                  currentDate={currentDate}
                  draft={draft}
                  metrics={metrics}
                  recentSnapshots={visibleSnapshots}
                  disabled={snapshotCount === 0 || editingDate !== null}
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
                  liquidCash={metrics.liquidCash}
                  financialAssets={metrics.financialAssets}
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
      <PwaUpdatePrompt />
    </div>
  );
}

export default App;
