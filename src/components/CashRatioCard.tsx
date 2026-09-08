import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { formatCurrency, formatPercent } from "@/lib/format";

interface CashRatioCardProps {
  ratio: number;
  totalCash: number;
  totalAssets: number;
}

/** 現金比例卡：呈現現金占總資產比例，搭配動態進度條（比照負債比卡樣式）。 */
export function CashRatioCard({
  ratio,
  totalCash,
  totalAssets,
}: CashRatioCardProps) {
  const width = Math.min(100, Math.max(0, ratio));

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1">
        <p className="text-sm text-slate-500">現金比例</p>
        <FormulaInfoButton
          title="現金比例"
          formula="現金比例 = 總流動現金 ÷ 總資產 × 100%"
          substitution={`${formatCurrency(totalCash)} ÷ ${formatCurrency(totalAssets)} × 100% = ${formatPercent(ratio)}`}
          note="總資產為 0 時強制為 0%，避免除以零"
        />
      </div>
      <p
        data-testid="cash-ratio-value"
        className="mt-1 text-2xl font-bold text-slate-900"
      >
        {formatPercent(ratio)}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          data-testid="cash-ratio-bar-fill"
          className="h-full rounded-full bg-sky-500 transition-all duration-100"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
