import { formatCurrency } from "@/lib/format";

interface CashFlowIndicatorProps {
  cashFlow: number;
}

/** 現金流動態燈號：文字標籤（收支為正/入不敷出）與顏色並存（PRD 4.1、7 節）。 */
export function CashFlowIndicator({ cashFlow }: CashFlowIndicatorProps) {
  const isNegative = cashFlow < 0;

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">本月預估現金流</p>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${isNegative ? "bg-rose-500" : "bg-emerald-500"}`}
          aria-hidden
        />
        <p
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
