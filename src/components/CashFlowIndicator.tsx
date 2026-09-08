import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { formatCurrency } from "@/lib/format";

interface CashFlowIndicatorProps {
  cashFlow: number;
  totalIncome: number;
  monthlyExpense: number;
  totalMonthlyDebtPayment: number;
}

/** 現金流動態燈號：文字標籤（收支為正/入不敷出）與顏色並存（PRD 4.1、7 節）。 */
export function CashFlowIndicator({
  cashFlow,
  totalIncome,
  monthlyExpense,
  totalMonthlyDebtPayment,
}: CashFlowIndicatorProps) {
  const isNegative = cashFlow < 0;

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1">
        <p className="text-sm text-slate-500">本月預估現金流</p>
        <FormulaInfoButton
          title="本月預估現金流"
          formula="現金流 = 收入合計 − 本月支出 − 本月應還款總額"
          substitution={`${formatCurrency(totalIncome)} − ${formatCurrency(monthlyExpense)} − ${formatCurrency(totalMonthlyDebtPayment)} = ${formatCurrency(cashFlow)}`}
        />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${isNegative ? "bg-rose-500" : "bg-emerald-500"}`}
          aria-hidden
        />
        <p
          data-testid="cash-flow-value"
          className={`text-2xl font-bold ${isNegative ? "text-rose-600" : "text-slate-900"}`}
        >
          {formatCurrency(cashFlow)}
        </p>
        <span className="text-xs text-slate-500">
          {isNegative ? "入不敷出" : "收支為正"}
        </span>
      </div>
    </div>
  );
}
