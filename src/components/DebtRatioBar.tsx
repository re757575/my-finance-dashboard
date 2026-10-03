import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { DEBT_RATIO_STATUS_LABEL } from "@/lib/calculations";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { DebtRatioStatus } from "@/types/schema";

const STATUS_STYLES: Record<DebtRatioStatus, { bar: string; badge: string }> = {
  "debt-free": {
    bar: "bg-emerald-500",
    badge:
      "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
  },
  healthy: {
    bar: "bg-green-500",
    badge: "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300",
  },
  elevated: {
    bar: "bg-amber-500",
    badge: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
  },
  "high-risk": {
    bar: "bg-rose-500",
    badge: "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300",
  },
};

interface DebtRatioBarProps {
  ratio: number;
  status: DebtRatioStatus;
  totalLiabilities: number;
  totalAssets: number;
}

/**
 * 負債比動態進度條與健康狀態標籤（PRD 5.1 節）。
 * 文字標籤與顏色同時呈現，顏色僅為輔助，不作為唯一判斷依據（PRD 7 節無障礙規範）。
 */
export function DebtRatioBar({
  ratio,
  status,
  totalLiabilities,
  totalAssets,
}: DebtRatioBarProps) {
  const width = Math.min(100, Math.max(0, ratio));
  const style = STATUS_STYLES[status];

  return (
    <div className="rounded-xl bg-white dark:bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <p className="text-sm text-slate-500 dark:text-neutral-400">負債比</p>
          <FormulaInfoButton
            title="負債比"
            formula="負債比 = 總負債 ÷ 總資產 × 100%"
            substitution={`${formatCurrency(totalLiabilities)} ÷ ${formatCurrency(totalAssets)} × 100% = ${formatPercent(ratio)}`}
            note="總資產含不動產市值；總資產為 0 時強制為 0%，避免除以零"
          />
        </div>
        <span
          data-testid="debt-ratio-status"
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style.badge}`}
        >
          {DEBT_RATIO_STATUS_LABEL[status]}
        </span>
      </div>
      <p
        data-testid="debt-ratio-value"
        className="mt-1 text-2xl font-bold text-slate-900 dark:text-neutral-50"
      >
        {formatPercent(ratio)}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
        <div
          data-testid="debt-ratio-bar-fill"
          className={`h-full rounded-full transition-all duration-100 ${style.bar}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
