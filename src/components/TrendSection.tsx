import { AllocationAreaChart } from "@/components/charts/AllocationAreaChart";
import { AssetsLiabilitiesBarChart } from "@/components/charts/AssetsLiabilitiesBarChart";
import { TrendLineChart } from "@/components/charts/TrendLineChart";
import { NetWorthPerformance } from "@/components/NetWorthPerformance";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calculateMetrics } from "@/lib/calculations";
import { formatCurrency, formatPercent } from "@/lib/format";
import { normalizeSnapshotNote } from "@/lib/snapshotNote";
import type { TrendRange } from "@/hooks/useLocalSnapshots";
import type { Snapshot } from "@/types/schema";

interface TrendSectionProps {
  visibleSnapshots: Snapshot[];
  snapshotCount: number;
  trendRange: TrendRange;
  onRangeChange: (next: TrendRange) => void;
  /** 目標淨資產，0 代表尚未設定；用於淨資產趨勢圖的目標參考線（PRD 4.2 節）。 */
  targetNetWorth: number;
}

/** 範圍下拉選單的選項，順序固定（PRD 4.2「趨勢圖範圍選項」）；365 為「1 年」、"ytd" 為「今年以來」。 */
const RANGE_OPTIONS: { value: TrendRange; label: string }[] = [
  { value: 7, label: "7 天" },
  { value: 30, label: "30 天" },
  { value: 90, label: "90 天" },
  { value: 365, label: "1 年" },
  { value: "ytd", label: "今年以來" },
  { value: "all", label: "全部" },
];

/** 趨勢圖分組分頁（PRD 4.2「趨勢圖分組分頁」）：八張圖表分成三組，一次只顯示一組。 */
const TREND_TABS = [
  { value: "assets", label: "資產" },
  { value: "liabilities", label: "負債" },
  { value: "allocation", label: "配置與儲蓄" },
] as const;

/** 各分頁共用的圖表卡片格線：桌面三欄、行動端單欄（PRD 第 7 節）。 */
const CHART_GRID_CLASS_NAME = "grid grid-cols-1 gap-3 md:grid-cols-3";

/**
 * 歷史趨勢圖區：八張獨立卡片分成三個分頁——資產（淨資產／現金／股票）、負債（負債比／資產負債對比／每月應還款）、
 * 配置與儲蓄（資產配置／儲蓄率），避免一次攤開八張卡片。現金、股票趨勢排在淨資產旁，方便對照淨資產變化是
 * 現金減少還是轉為股票（PRD 4.2、6 節）。
 */
export function TrendSection({
  visibleSnapshots,
  snapshotCount,
  trendRange,
  onRangeChange,
  targetNetWorth,
}: TrendSectionProps) {
  // note 隨每個節點傳給各圖表：有備註的節點以圓環標示、Tooltip 多一行（PRD 4.2「快照備註」）
  const points = visibleSnapshots.map((s) => ({
    date: s.date,
    note: normalizeSnapshotNote(s.note),
    ...calculateMetrics(s),
  }));

  // 資產配置趨勢只納入「有可配置資產」的快照：金融資產為 0（或為負）、或任一類占比為負（例如不可動用現金
  // 大於總現金）時，各類占比沒有意義、也無法堆疊成 100%，排除之（PRD 4.2「資產配置趨勢圖」）
  const allocationPoints = points
    .filter(
      (p) =>
        p.financialAssets > 0 &&
        p.cashRatio >= 0 &&
        p.restrictedCashRatio >= 0 &&
        p.twStockRatio >= 0 &&
        p.usStockRatio >= 0
    )
    .map((p) => ({
      date: p.date,
      note: p.note,
      cashRatio: p.cashRatio,
      restrictedCashRatio: p.restrictedCashRatio,
      twStockRatio: p.twStockRatio,
      usStockRatio: p.usStockRatio,
    }));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-neutral-100">
          歷史趨勢
        </h2>
        {snapshotCount > 0 && (
          <select
            aria-label="趨勢圖範圍"
            value={trendRange}
            onChange={(e) => {
              // <option> 的 value 一律是字串，從選項表對回原本的型別（數字天數或 "ytd"／"all"）
              const selected = RANGE_OPTIONS.find(
                (option) => String(option.value) === e.target.value
              );
              if (selected) onRangeChange(selected.value);
            }}
            className="h-9 rounded-md border border-slate-200 bg-white dark:border-input dark:bg-input/30 px-2 text-base md:text-sm"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {/* 成長率與最大回撤跟著範圍下拉選單連動，與圖表共用同一組已存檔快照；少於 2 筆時不渲染
          （PRD 4.2「淨資產成長率與最大回撤」） */}
      <NetWorthPerformance snapshots={visibleSnapshots} />
      {/* 選取的分頁只存在元件 state（不寫入 LocalStorage），重新整理後回到「資產」；
          未選取分頁的內容不會被渲染，圖表不在 DOM 中（PRD 4.2「趨勢圖分組分頁」） */}
      <Tabs defaultValue={TREND_TABS[0].value} className="space-y-3">
        <TabsList aria-label="趨勢圖分組">
          {TREND_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="assets" className={CHART_GRID_CLASS_NAME}>
          <TrendLineChart
            title="淨資產趨勢"
            points={points.map((p) => ({
              date: p.date,
              note: p.note,
              value: p.netWorth,
            }))}
            formatValue={formatCurrency}
            colorClassName="text-blue-500"
            showDelta
            targetValue={targetNetWorth}
          />
          <TrendLineChart
            title="現金趨勢"
            points={points.map((p) => ({
              date: p.date,
              note: p.note,
              value: p.totalCash,
            }))}
            formatValue={formatCurrency}
            colorClassName="text-teal-500"
            showDelta
          />
          <TrendLineChart
            title="股票趨勢"
            points={points.map((p) => ({
              date: p.date,
              note: p.note,
              value: p.totalStockValue,
            }))}
            formatValue={formatCurrency}
            colorClassName="text-violet-500"
            showDelta
          />
        </TabsContent>
        <TabsContent value="liabilities" className={CHART_GRID_CLASS_NAME}>
          <TrendLineChart
            title="負債比趨勢"
            points={points.map((p) => ({
              date: p.date,
              note: p.note,
              value: p.debtRatio,
            }))}
            formatValue={formatPercent}
            colorClassName="text-amber-500"
          />
          <AssetsLiabilitiesBarChart
            points={points.map((p) => ({
              date: p.date,
              note: p.note,
              assets: p.totalAssets,
              liabilities: p.totalLiabilities,
            }))}
          />
          <TrendLineChart
            title="每月應還款趨勢"
            points={points.map((p) => ({
              date: p.date,
              note: p.note,
              value: p.totalMonthlyDebtPayment,
            }))}
            formatValue={formatCurrency}
            colorClassName="text-orange-500"
            showDelta
          />
        </TabsContent>
        <TabsContent value="allocation" className={CHART_GRID_CLASS_NAME}>
          <AllocationAreaChart points={allocationPoints} />
          <TrendLineChart
            title="儲蓄率趨勢"
            points={points.map((p) => ({
              date: p.date,
              note: p.note,
              value: p.savingsRate,
            }))}
            formatValue={formatPercent}
            colorClassName="text-sky-500"
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
