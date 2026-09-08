import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { formatCurrency, formatPercent } from "@/lib/format";

const SEGMENTS = [
  { key: "cash", label: "現金", color: "bg-blue-600" },
  { key: "twStock", label: "台股", color: "bg-orange-600" },
  { key: "usStock", label: "美股", color: "bg-teal-600" },
] as const;

interface AssetAllocationBarProps {
  cashRatio: number;
  twStockRatio: number;
  usStockRatio: number;
  totalAssets: number;
  totalCash: number;
  twStockValue: number;
  usStockValueInTwd: number;
}

/**
 * 資產配置比例水平堆疊長條圖（PRD 第 5 節資產配置比例公式、4.2 節）。
 * 選型理由：水平堆疊長條圖比圓餅圖更容易精準比較區塊大小、也更容易加上直接標籤。
 * 總資產為 0 時改顯示空狀態提示文字，不畫出全零的長條。
 */
export function AssetAllocationBar({
  cashRatio,
  twStockRatio,
  usStockRatio,
  totalAssets,
  totalCash,
  twStockValue,
  usStockValueInTwd,
}: AssetAllocationBarProps) {
  if (totalAssets === 0) {
    return (
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">資產配置</p>
        <div
          data-testid="asset-allocation-empty"
          className="mt-2 flex h-16 items-center justify-center rounded-lg bg-slate-50 px-4 text-center text-sm text-slate-400"
        >
          尚未輸入任何資產
        </div>
      </div>
    );
  }

  const ratios: Record<(typeof SEGMENTS)[number]["key"], number> = {
    cash: cashRatio,
    twStock: twStockRatio,
    usStock: usStockRatio,
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1">
        <p className="text-sm text-slate-500">資產配置</p>
        <FormulaInfoButton
          title="資產配置比例"
          formula={"各類佔比 = 該類金額 ÷ 總資產 × 100%"}
          substitution={[
            `現金：${formatCurrency(totalCash)} ÷ ${formatCurrency(totalAssets)} × 100% = ${formatPercent(cashRatio)}`,
            `台股：${formatCurrency(twStockValue)} ÷ ${formatCurrency(totalAssets)} × 100% = ${formatPercent(twStockRatio)}`,
            `美股：${formatCurrency(usStockValueInTwd)} ÷ ${formatCurrency(totalAssets)} × 100% = ${formatPercent(usStockRatio)}`,
          ].join("\n")}
        />
      </div>
      <div
        className="mt-3 flex h-6 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`資產配置：現金 ${formatPercent(cashRatio)}，台股 ${formatPercent(twStockRatio)}，美股 ${formatPercent(usStockRatio)}`}
      >
        {SEGMENTS.map((segment) => {
          const ratio = ratios[segment.key];
          if (ratio <= 0) return null;
          return (
            <div
              key={segment.key}
              data-testid={`asset-allocation-segment-${segment.key}`}
              className={`flex items-center justify-center text-[10px] font-medium text-white ${segment.color}`}
              style={{ width: `${ratio}%` }}
            >
              {ratio >= 12 ? formatPercent(ratio) : ""}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {SEGMENTS.map((segment) => (
          <span key={segment.key} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${segment.color}`} />
            {segment.label} {formatPercent(ratios[segment.key])}
          </span>
        ))}
      </div>
    </div>
  );
}
