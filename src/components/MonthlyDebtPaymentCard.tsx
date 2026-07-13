import { formatCurrency } from "@/lib/format";

interface MonthlyDebtPaymentCardProps {
  amount: number;
}

/** 本月應還款總額卡：負債清單各筆每月應還款金額加總（PRD 4.2、5.2 節）。 */
export function MonthlyDebtPaymentCard({
  amount,
}: MonthlyDebtPaymentCardProps) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">本月應還款總額</p>
      <p
        data-testid="total-monthly-debt-payment"
        className="mt-1 text-2xl font-bold text-slate-900"
      >
        {formatCurrency(amount)}
      </p>
    </div>
  );
}
