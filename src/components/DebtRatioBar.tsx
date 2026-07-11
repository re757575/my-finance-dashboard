import { DEBT_RATIO_STATUS_LABEL } from "@/lib/calculations";
import { formatPercent } from "@/lib/format";
import type { DebtRatioStatus } from "@/types/schema";

const STATUS_STYLES: Record<DebtRatioStatus, { bar: string; badge: string }> = {
  "debt-free": {
    bar: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700",
  },
  healthy: { bar: "bg-green-500", badge: "bg-green-50 text-green-700" },
  elevated: { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700" },
  "high-risk": { bar: "bg-rose-500", badge: "bg-rose-50 text-rose-700" },
};

interface DebtRatioBarProps {
  ratio: number;
  status: DebtRatioStatus;
}

/**
 * 負債比動態進度條與健康狀態標籤（PRD 5.1 節）。
 * 文字標籤與顏色同時呈現，顏色僅為輔助，不作為唯一判斷依據（PRD 7 節無障礙規範）。
 */
export function DebtRatioBar({ ratio, status }: DebtRatioBarProps) {
  const width = Math.min(100, Math.max(0, ratio));
  const style = STATUS_STYLES[status];

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">負債比</p>
        <span
          data-testid="debt-ratio-status"
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}
        >
          {DEBT_RATIO_STATUS_LABEL[status]}
        </span>
      </div>
      <p
        data-testid="debt-ratio-value"
        className="mt-1 text-2xl font-bold text-slate-900"
      >
        {formatPercent(ratio)}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          data-testid="debt-ratio-bar-fill"
          className={`h-full rounded-full transition-all duration-100 ${style.bar}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
