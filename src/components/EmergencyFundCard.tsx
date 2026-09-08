import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { EMERGENCY_FUND_STATUS_LABEL } from "@/lib/calculations";
import { formatCurrency, formatMonths } from "@/lib/format";
import type { EmergencyFundStatus } from "@/types/schema";

const STATUS_STYLES: Record<
  EmergencyFundStatus,
  { bar: string; badge: string }
> = {
  "no-need": { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  insufficient: { bar: "bg-rose-500", badge: "bg-rose-50 text-rose-700" },
  basic: { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700" },
  sufficient: {
    bar: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700",
  },
};

/** 進度條以 6 個月（「預備充足」門檻）為滿條參考值，見 PRD 5.5 節。 */
const FULL_BAR_MONTHS = 6;

interface EmergencyFundCardProps {
  months: number | null;
  status: EmergencyFundStatus;
  totalCash: number;
  monthlyExpense: number;
  totalMonthlyDebtPayment: number;
}

/**
 * 緊急預備金月數卡（PRD 5.5 節）：總流動現金 ÷（本月支出 + 本月應還款總額）。
 * 分母為 0 時 months 為 null，顯示「∞」與「無需求」狀態，不套用風險分級。
 */
export function EmergencyFundCard({
  months,
  status,
  totalCash,
  monthlyExpense,
  totalMonthlyDebtPayment,
}: EmergencyFundCardProps) {
  const style = STATUS_STYLES[status];
  const width =
    months === null
      ? 100
      : Math.min(100, Math.max(0, (months / FULL_BAR_MONTHS) * 100));
  const denominator = monthlyExpense + totalMonthlyDebtPayment;
  const substitution =
    denominator === 0
      ? `${formatCurrency(totalCash)} ÷ $0 = ∞（無需求）`
      : `${formatCurrency(totalCash)} ÷ (${formatCurrency(monthlyExpense)} + ${formatCurrency(totalMonthlyDebtPayment)}) = ${formatMonths(months)}`;

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <p className="text-sm text-slate-500">緊急預備金月數</p>
          <FormulaInfoButton
            title="緊急預備金月數"
            formula="緊急預備金月數 = 總流動現金 ÷（本月支出 + 本月應還款總額）"
            substitution={substitution}
            note="分母為 0（本月支出與本月應還款總額皆為 0）時顯示「∞」，代表無需求"
          />
        </div>
        <span
          data-testid="emergency-fund-status"
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}
        >
          {EMERGENCY_FUND_STATUS_LABEL[status]}
        </span>
      </div>
      <p
        data-testid="emergency-fund-value"
        className="mt-1 text-2xl font-bold text-slate-900"
      >
        {formatMonths(months)}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          data-testid="emergency-fund-bar-fill"
          className={`h-full rounded-full transition-all duration-100 ${style.bar}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
