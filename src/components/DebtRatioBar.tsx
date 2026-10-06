import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import {
  DEBT_RATIO_STATUS_LABEL,
  hasSeparateFinancialDebtRatio,
} from "@/lib/calculations";
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
  /** 金融負債比（PRD 5.1a 節）；金融資產 ≤ 0 時為 null。 */
  financialRatio: number | null;
  financialStatus: DebtRatioStatus | null;
  /** 金融負債：房貸以外的負債本金合計。 */
  financialLiabilities: number;
  /** 金融資產：現金＋股票，不含不動產。 */
  financialAssets: number;
}

/**
 * 負債比動態進度條與健康狀態標籤（PRD 5.1 節）。
 * 文字標籤與顏色同時呈現，顏色僅為輔助，不作為唯一判斷依據（PRD 7 節無障礙規範）。
 * 有不動產或房貸時，下方另列不含兩者的「金融負債比」（PRD 5.1a 節），主數字與燈號不受影響。
 */
export function DebtRatioBar({
  ratio,
  status,
  totalLiabilities,
  totalAssets,
  financialRatio,
  financialStatus,
  financialLiabilities,
  financialAssets,
}: DebtRatioBarProps) {
  const width = Math.min(100, Math.max(0, ratio));
  const style = STATUS_STYLES[status];
  // 沒有不動產也沒有房貸時兩者相同，不重複顯示
  const financial =
    financialRatio !== null &&
    financialStatus !== null &&
    hasSeparateFinancialDebtRatio({
      totalAssets,
      financialAssets,
      totalLiabilities,
      financialLiabilities,
      financialDebtRatio: financialRatio,
    })
      ? { ratio: financialRatio, status: financialStatus }
      : null;
  const substitution = `${formatCurrency(totalLiabilities)} ÷ ${formatCurrency(totalAssets)} × 100% = ${formatPercent(ratio)}`;

  return (
    <div className="rounded-xl bg-white dark:bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <p className="text-sm text-slate-500 dark:text-neutral-400">負債比</p>
          <FormulaInfoButton
            title="負債比"
            formula={
              financial
                ? "負債比 = 總負債 ÷ 總資產 × 100%\n金融負債比 = 金融負債 ÷ 金融資產 × 100%"
                : "負債比 = 總負債 ÷ 總資產 × 100%"
            }
            substitution={
              financial
                ? `負債比：${substitution}\n金融負債比：${formatCurrency(financialLiabilities)} ÷ ${formatCurrency(financialAssets)} × 100% = ${formatPercent(financial.ratio)}`
                : substitution
            }
            note={
              financial
                ? "總資產含不動產市值；總資產為 0 時強制為 0%，避免除以零。金融負債為房貸以外的負債，金融資產為現金＋股票"
                : "總資產含不動產市值；總資產為 0 時強制為 0%，避免除以零"
            }
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
      {financial && (
        <div
          data-testid="financial-debt-ratio"
          className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-slate-100 dark:border-border pt-2"
        >
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            金融負債比（不含不動產與房貸）
          </p>
          <div className="flex items-center gap-2">
            <span
              data-testid="financial-debt-ratio-value"
              className="text-sm font-medium text-slate-900 dark:text-neutral-50"
            >
              {formatPercent(financial.ratio)}
            </span>
            <span
              data-testid="financial-debt-ratio-status"
              className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLES[financial.status].badge}`}
            >
              {DEBT_RATIO_STATUS_LABEL[financial.status]}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
