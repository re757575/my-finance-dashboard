import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { formatCurrency, formatPercent } from "@/lib/format";

interface CashRatioCardProps {
  ratio: number;
  /** 可動用現金（不含不可動用來源）。 */
  liquidCash: number;
  /** 金融資產＝現金＋股票，不含不動產（PRD 第 5 節）。 */
  financialAssets: number;
}

/** 現金比例卡：呈現可動用現金占金融資產比例，搭配動態進度條（比照負債比卡樣式）。 */
export function CashRatioCard({
  ratio,
  liquidCash,
  financialAssets,
}: CashRatioCardProps) {
  const width = Math.min(100, Math.max(0, ratio));

  return (
    <div className="rounded-xl bg-white dark:bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1">
        <p className="text-sm text-slate-500 dark:text-neutral-400">現金比例</p>
        <FormulaInfoButton
          title="現金比例"
          formula="現金比例 = 可動用現金 ÷ 金融資產 × 100%"
          substitution={`${formatCurrency(liquidCash)} ÷ ${formatCurrency(financialAssets)} × 100% = ${formatPercent(ratio)}`}
          note="金融資產＝現金＋股票（不含不動產）；不含標記為「不可動用」的現金來源；金融資產為 0 時強制為 0%，避免除以零"
        />
      </div>
      <p
        data-testid="cash-ratio-value"
        className="mt-1 text-2xl font-bold text-slate-900 dark:text-neutral-50"
      >
        {formatPercent(ratio)}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
        <div
          data-testid="cash-ratio-bar-fill"
          className="h-full rounded-full bg-sky-500 transition-all duration-100"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
