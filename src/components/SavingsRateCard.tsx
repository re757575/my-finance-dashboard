import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { SAVINGS_RATE_STATUS_LABEL } from "@/lib/calculations";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { SavingsRateStatus } from "@/types/schema";

const STATUS_STYLES: Record<SavingsRateStatus, { bar: string; badge: string }> =
  {
    negative: {
      bar: "bg-rose-500",
      badge: "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300",
    },
    low: {
      bar: "bg-amber-500",
      badge: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
    },
    healthy: {
      bar: "bg-green-500",
      badge: "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300",
    },
    high: {
      bar: "bg-emerald-500",
      badge:
        "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    },
  };

interface SavingsRateCardProps {
  rate: number;
  status: SavingsRateStatus;
  cashFlow: number;
  totalIncome: number;
  /** 本月償還的負債本金合計；大於 0 時於卡片下方另列含償還本金的儲蓄率。 */
  principalRepayment: number;
  /** 含償還本金的儲蓄率（PRD 5.6 節），只作對照、不分級。 */
  rateWithPrincipal: number;
}

/**
 * 儲蓄率卡（PRD 5.6 節）：現金流 ÷ 總收入 × 100%，總收入為 0 時強制為 0。
 * 本月有償還負債本金時，下方另列把本金加回的儲蓄率（還本金不減少淨資產），主數字與燈號不受影響。
 */
export function SavingsRateCard({
  rate,
  status,
  cashFlow,
  totalIncome,
  principalRepayment,
  rateWithPrincipal,
}: SavingsRateCardProps) {
  const style = STATUS_STYLES[status];
  const width = Math.min(100, Math.max(0, rate));
  const showWithPrincipal = principalRepayment > 0;
  const substitution = `${formatCurrency(cashFlow)} ÷ ${formatCurrency(totalIncome)} × 100% = ${formatPercent(rate)}`;

  return (
    <div className="rounded-xl bg-white dark:bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <p className="text-sm text-slate-500 dark:text-neutral-400">儲蓄率</p>
          <FormulaInfoButton
            title="儲蓄率"
            formula={
              showWithPrincipal
                ? "儲蓄率 = 現金流 ÷ 總收入 × 100%\n含償還本金 =（現金流 + 本月償還本金）÷ 總收入 × 100%"
                : "儲蓄率 = 現金流 ÷ 總收入 × 100%"
            }
            substitution={
              showWithPrincipal
                ? `儲蓄率：${substitution}\n含償還本金：(${formatCurrency(cashFlow)} + ${formatCurrency(principalRepayment)}) ÷ ${formatCurrency(totalIncome)} × 100% = ${formatPercent(rateWithPrincipal)}`
                : substitution
            }
            note={
              showWithPrincipal
                ? "總收入為 0 時強制為 0%，避免除以零。還本金只是把現金換成負債減少，淨資產不變；燈號仍以現金基礎的儲蓄率為準"
                : "總收入為 0 時強制為 0%，避免除以零"
            }
          />
        </div>
        <span
          data-testid="savings-rate-status"
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style.badge}`}
        >
          {SAVINGS_RATE_STATUS_LABEL[status]}
        </span>
      </div>
      <p
        data-testid="savings-rate-value"
        className={`mt-1 text-2xl font-bold ${rate < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-neutral-50"}`}
      >
        {formatPercent(rate)}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
        <div
          data-testid="savings-rate-bar-fill"
          className={`h-full rounded-full transition-all duration-100 ${style.bar}`}
          style={{ width: `${width}%` }}
        />
      </div>
      {showWithPrincipal && (
        <p
          data-testid="savings-rate-with-principal"
          className="mt-2 text-xs text-slate-500 dark:text-neutral-400"
        >
          含償還本金{" "}
          <span className="font-medium text-slate-900 dark:text-neutral-50">
            {formatPercent(rateWithPrincipal)}
          </span>
          （本月還本 {formatCurrency(principalRepayment)}）
        </p>
      )}
    </div>
  );
}
