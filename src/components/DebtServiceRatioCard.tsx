import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { DEBT_SERVICE_RATIO_STATUS_LABEL } from "@/lib/calculations";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { DebtServiceRatioStatus } from "@/types/schema";

const STATUS_STYLES: Record<
  DebtServiceRatioStatus,
  { bar: string; badge: string }
> = {
  "no-payment": {
    bar: "bg-emerald-500",
    badge:
      "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
  },
  comfortable: {
    bar: "bg-green-500",
    badge: "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300",
  },
  heavy: {
    bar: "bg-amber-500",
    badge: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
  },
  excessive: {
    bar: "bg-rose-500",
    badge: "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300",
  },
  "no-income": {
    bar: "bg-rose-500",
    badge: "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300",
  },
};

interface DebtServiceRatioCardProps {
  /** 償債負擔率（%）；總收入為 0 但有應還款時為 null（無法計算）。 */
  ratio: number | null;
  status: DebtServiceRatioStatus;
  totalMonthlyDebtPayment: number;
  totalIncome: number;
}

/**
 * 償債負擔率卡（PRD 5.2b 節）：本月應還款總額 ÷ 總收入 × 100%。
 * 文字標籤與顏色同時呈現，顏色僅為輔助（PRD 7 節無障礙規範）。
 * 總收入為 0 但有應還款時無法計算，數值顯示「—」、進度條填滿。
 */
export function DebtServiceRatioCard({
  ratio,
  status,
  totalMonthlyDebtPayment,
  totalIncome,
}: DebtServiceRatioCardProps) {
  const style = STATUS_STYLES[status];
  const width = ratio === null ? 100 : Math.min(100, Math.max(0, ratio));
  const amounts = `${formatCurrency(totalMonthlyDebtPayment)} ÷ ${formatCurrency(totalIncome)}`;

  return (
    <div className="rounded-xl bg-white dark:bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            償債負擔率
          </p>
          <FormulaInfoButton
            title="償債負擔率"
            formula="償債負擔率 = 本月應還款總額 ÷ 總收入 × 100%"
            substitution={
              ratio === null
                ? `${amounts}：總收入為 0，無法計算`
                : `${amounts} × 100% = ${formatPercent(ratio)}`
            }
            note="本月應還款總額為 0 時為 0%；總收入為 0 但有應還款時無法計算，顯示「—」。低於 30% 為負擔輕鬆，30%–40% 為負擔偏重，超過 40% 為負擔過重"
          />
        </div>
        <span
          data-testid="debt-service-ratio-status"
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style.badge}`}
        >
          {DEBT_SERVICE_RATIO_STATUS_LABEL[status]}
        </span>
      </div>
      <p
        data-testid="debt-service-ratio-value"
        className="mt-1 text-2xl font-bold text-slate-900 dark:text-neutral-50"
      >
        {ratio === null ? "—" : formatPercent(ratio)}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
        <div
          data-testid="debt-service-ratio-bar-fill"
          className={`h-full rounded-full transition-all duration-100 ${style.bar}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
