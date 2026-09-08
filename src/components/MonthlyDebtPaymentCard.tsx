import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { calculateMonthlyPayment } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import type { Debt } from "@/types/schema";

interface MonthlyDebtPaymentCardProps {
  amount: number;
  debts: Debt[];
}

/** 本月應還款總額卡：負債清單各筆每月應還款金額加總（PRD 4.2、5.2 節）。 */
export function MonthlyDebtPaymentCard({
  amount,
  debts,
}: MonthlyDebtPaymentCardProps) {
  const substitution =
    debts.length === 0
      ? "尚無負債，本月應還款總額為 $0"
      : `${debts
          .map(
            (debt) =>
              `${formatCurrency(calculateMonthlyPayment(debt))}（${debt.name || debt.category}）`
          )
          .join(" + ")} = ${formatCurrency(amount)}`;

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1">
        <p className="text-sm text-slate-500">本月應還款總額</p>
        <FormulaInfoButton
          title="本月應還款總額"
          formula="本月應還款總額 = 各筆負債的「每月應還款金額」加總"
          substitution={substitution}
        />
      </div>
      <p
        data-testid="total-monthly-debt-payment"
        className="mt-1 text-2xl font-bold text-slate-900"
      >
        {formatCurrency(amount)}
      </p>
    </div>
  );
}
