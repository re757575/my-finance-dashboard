import { useState } from "react";
import { CashFlowIndicator } from "@/components/CashFlowIndicator";
import { CashFlowInput } from "@/components/CashFlowInput";
import { CashSourceList } from "@/components/CashSourceList";
import { DataManagement } from "@/components/DataManagement";
import { DebtInputs } from "@/components/DebtInputs";
import { DebtRatioBar } from "@/components/DebtRatioBar";
import { StockInputs } from "@/components/StockInputs";
import { SummaryCards } from "@/components/SummaryCards";
import { TrendSection } from "@/components/TrendSection";
import { Button } from "@/components/ui/button";
import { useLocalSnapshots } from "@/hooks/useLocalSnapshots";

function App() {
  const {
    currentMonth,
    loadStatus,
    draft,
    metrics,
    isDirty,
    updateDraft,
    save,
    exportBackup,
    importBackup,
    clearAllData,
    snapshotCount,
    visibleSnapshots,
    showAllHistory,
    setShowAllHistory,
  } = useLocalSnapshots();

  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  function handleSave() {
    const result = save();
    setSaveMessage(
      result.ok ? "已更新並儲存本月資料。" : (result.reason ?? "儲存失敗")
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
          <p className="text-sm text-slate-500">目前檢視月份：{currentMonth}</p>
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
            <DebtInputs
              loan={draft.loan}
              otherDebt={draft.otherDebt}
              onChange={updateDraft}
            />
            <CashFlowInput
              value={draft.cashFlow}
              onChange={(cashFlow) => updateDraft({ cashFlow })}
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
              <SummaryCards metrics={metrics} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DebtRatioBar
                  ratio={metrics.debtRatio}
                  status={metrics.debtRatioStatus}
                />
                <CashFlowIndicator cashFlow={draft.cashFlow} />
              </div>
            </section>

            <TrendSection
              visibleSnapshots={visibleSnapshots}
              snapshotCount={snapshotCount}
              showAllHistory={showAllHistory}
              onToggleHistory={setShowAllHistory}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
