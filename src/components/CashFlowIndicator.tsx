import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { formatCurrency } from "@/lib/format";

interface CashFlowIndicatorProps {
  cashFlow: number;
  totalIncome: number;
  monthlyExpense: number;
  totalMonthlyDebtPayment: number;
  /** 每月定期定額合計；大於 0 時於燈號下方另列定期定額後剩餘。 */
  recurringInvestment: number;
  /** 定期定額後剩餘 = 現金流 − 定期定額合計（PRD 5.3a 節），只作對照、不分級。 */
  cashFlowAfterInvestment: number;
}

/**
 * 現金流動態燈號：文字標籤（收支為正/入不敷出）與顏色並存（PRD 4.1、7 節）。
 * 有定期定額時，下方另列扣掉它之後的剩餘現金（定期定額不算支出），主數字與燈號不受影響。
 */
export function CashFlowIndicator({
  cashFlow,
  totalIncome,
  monthlyExpense,
  totalMonthlyDebtPayment,
  recurringInvestment,
  cashFlowAfterInvestment,
}: CashFlowIndicatorProps) {
  const isNegative = cashFlow < 0;
  const showAfterInvestment = recurringInvestment > 0;
  const isShortfall = cashFlowAfterInvestment < 0;
  const substitution = `${formatCurrency(totalIncome)} − ${formatCurrency(monthlyExpense)} − ${formatCurrency(totalMonthlyDebtPayment)} = ${formatCurrency(cashFlow)}`;

  return (
    <div className="@container rounded-xl bg-white dark:bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1">
        <p className="text-sm text-slate-500 dark:text-neutral-400">
          本月預估現金流
        </p>
        <FormulaInfoButton
          title="本月預估現金流"
          formula={
            showAfterInvestment
              ? "現金流 = 收入合計 − 本月支出 − 本月應還款總額\n定期定額後剩餘 = 現金流 − 定期定額合計"
              : "現金流 = 收入合計 − 本月支出 − 本月應還款總額"
          }
          substitution={
            showAfterInvestment
              ? `現金流：${substitution}\n定期定額後剩餘：${formatCurrency(cashFlow)} − ${formatCurrency(recurringInvestment)} = ${formatCurrency(cashFlowAfterInvestment)}`
              : substitution
          }
          note={
            showAfterInvestment
              ? "定期定額只是把現金換成股票，淨資產不變，不算支出；燈號仍以現金流為準"
              : undefined
          }
        />
      </div>
      {/* 卡片較窄（手機兩欄並排）時，狀態文字整個換到下一行，金額字級隨卡片寬度略縮 */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${isNegative ? "bg-rose-500" : "bg-emerald-500"}`}
          aria-hidden
        />
        <p
          data-testid="cash-flow-value"
          className={`text-[clamp(1.125rem,15cqw,1.5rem)] leading-8 font-bold ${isNegative ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-neutral-50"}`}
        >
          {formatCurrency(cashFlow)}
        </p>
        <span className="text-xs whitespace-nowrap text-slate-500 dark:text-neutral-400">
          {isNegative ? "入不敷出" : "收支為正"}
        </span>
      </div>
      {showAfterInvestment && (
        <p
          data-testid="cash-flow-after-investment"
          className="mt-2 text-xs text-slate-500 dark:text-neutral-400"
        >
          定期定額後剩餘{" "}
          <span
            className={`font-medium ${isShortfall ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-neutral-50"}`}
          >
            {formatCurrency(cashFlowAfterInvestment)}
          </span>
          （定期定額 {formatCurrency(recurringInvestment)}
          {isShortfall ? "，不足以支應" : ""}）
        </p>
      )}
    </div>
  );
}
