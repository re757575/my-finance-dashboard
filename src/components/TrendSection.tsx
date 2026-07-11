import { AssetsLiabilitiesBarChart } from "@/components/charts/AssetsLiabilitiesBarChart";
import { TrendLineChart } from "@/components/charts/TrendLineChart";
import { Button } from "@/components/ui/button";
import { calculateMetrics } from "@/lib/calculations";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { Snapshot } from "@/types/schema";

interface TrendSectionProps {
  visibleSnapshots: Snapshot[];
  snapshotCount: number;
  showAllHistory: boolean;
  onToggleHistory: (next: boolean) => void;
}

/** 歷史趨勢圖區：淨資產／負債比／資產負債對比三張獨立卡片（PRD 4.2、6 節）。 */
export function TrendSection({
  visibleSnapshots,
  snapshotCount,
  showAllHistory,
  onToggleHistory,
}: TrendSectionProps) {
  const points = visibleSnapshots.map((s) => ({
    month: s.month,
    ...calculateMetrics(s),
  }));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">歷史趨勢</h2>
        {snapshotCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onToggleHistory(!showAllHistory)}
          >
            {showAllHistory ? "只看最近 12 個月" : "查看全部歷史"}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <TrendLineChart
          title="淨資產趨勢"
          points={points.map((p) => ({ month: p.month, value: p.netWorth }))}
          formatValue={formatCurrency}
          colorClassName="text-blue-500"
        />
        <TrendLineChart
          title="負債比趨勢"
          points={points.map((p) => ({ month: p.month, value: p.debtRatio }))}
          formatValue={formatPercent}
          colorClassName="text-amber-500"
        />
        <AssetsLiabilitiesBarChart
          points={points.map((p) => ({
            month: p.month,
            assets: p.totalAssets,
            liabilities: p.totalLiabilities,
          }))}
        />
      </div>
    </section>
  );
}
