import { AssetsLiabilitiesBarChart } from "@/components/charts/AssetsLiabilitiesBarChart";
import { TrendLineChart } from "@/components/charts/TrendLineChart";
import { calculateMetrics } from "@/lib/calculations";
import { formatCurrency, formatPercent } from "@/lib/format";
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

const RANGE_OPTIONS: { value: TrendRange; label: string }[] = [
  { value: 7, label: "7 天" },
  { value: 30, label: "30 天" },
  { value: 90, label: "90 天" },
  { value: "all", label: "全部" },
];

/** 歷史趨勢圖區：淨資產／負債比／資產負債對比三張獨立卡片（PRD 4.2、6 節）。 */
export function TrendSection({
  visibleSnapshots,
  snapshotCount,
  trendRange,
  onRangeChange,
  targetNetWorth,
}: TrendSectionProps) {
  const points = visibleSnapshots.map((s) => ({
    date: s.date,
    ...calculateMetrics(s),
  }));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">歷史趨勢</h2>
        {snapshotCount > 0 && (
          <select
            aria-label="趨勢圖範圍"
            value={trendRange}
            onChange={(e) => {
              const value = e.target.value;
              onRangeChange(
                value === "all" ? "all" : (Number(value) as TrendRange)
              );
            }}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <TrendLineChart
          title="淨資產趨勢"
          points={points.map((p) => ({ date: p.date, value: p.netWorth }))}
          formatValue={formatCurrency}
          colorClassName="text-blue-500"
          showDelta
          targetValue={targetNetWorth}
        />
        <TrendLineChart
          title="負債比趨勢"
          points={points.map((p) => ({ date: p.date, value: p.debtRatio }))}
          formatValue={formatPercent}
          colorClassName="text-amber-500"
        />
        <AssetsLiabilitiesBarChart
          points={points.map((p) => ({
            date: p.date,
            assets: p.totalAssets,
            liabilities: p.totalLiabilities,
          }))}
        />
      </div>
    </section>
  );
}
