import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import {
  PLEDGE_MAINTENANCE_STATUS_LABEL,
  PLEDGE_MARGIN_CALL_RATIO,
} from "@/lib/calculations";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { PledgeMaintenanceStatus } from "@/types/schema";

type RatedStatus = Exclude<PledgeMaintenanceStatus, "none" | "unset">;

const STATUS_STYLES: Record<RatedStatus, { bar: string; badge: string }> = {
  safe: {
    bar: "bg-emerald-500",
    badge:
      "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
  },
  watch: {
    bar: "bg-green-500",
    badge: "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300",
  },
  warning: {
    bar: "bg-amber-500",
    badge: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
  },
  "margin-call": {
    bar: "bg-rose-500",
    badge: "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300",
  },
};

/** 進度條以 200% 為滿條參考值，追繳線 130% 落在約 65% 處。 */
const FULL_BAR_RATIO = 200;

interface PledgeMaintenanceCardProps {
  ratio: number | null;
  status: PledgeMaintenanceStatus;
  pledgePrincipal: number;
  pledgeCollateralValue: number;
  dropToMarginCall: number | null;
}

/**
 * 質押整戶維持率卡（PRD 5.8 節）：質押股票市值合計 ÷ 質押負債本金合計。
 * 無質押負債（status 為 none）時不顯示；尚未填寫質押股票市值（unset）時只顯示引導文字。
 * 文字標籤與顏色同時呈現，不只用顏色傳達狀態（PRD 7 節無障礙規範）。
 */
export function PledgeMaintenanceCard({
  ratio,
  status,
  pledgePrincipal,
  pledgeCollateralValue,
  dropToMarginCall,
}: PledgeMaintenanceCardProps) {
  if (status === "none") return null;

  const formulaButton = (
    <FormulaInfoButton
      title="質押整戶維持率"
      formula="維持率 = 質押股票市值合計 ÷ 質押負債本金合計 × 100%"
      substitution={
        ratio === null
          ? "尚未填寫質押股票市值"
          : `${formatCurrency(pledgeCollateralValue)} ÷ ${formatCurrency(pledgePrincipal)} × 100% = ${formatPercent(ratio)}`
      }
      note={`追繳線採常見的 ${PLEDGE_MARGIN_CALL_RATIO}%，各券商／銀行標準不同，僅供參考；下跌空間假設擔保品整體同比例下跌、本金不變`}
    />
  );

  if (status === "unset" || ratio === null) {
    return (
      <div className="rounded-xl bg-white dark:bg-card p-4 shadow-sm">
        <div className="flex items-center gap-1">
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            質押整戶維持率
          </p>
          {formulaButton}
        </div>
        <p
          data-testid="pledge-maintenance-unset"
          className="mt-2 text-sm text-slate-400 dark:text-neutral-400"
        >
          尚未填寫質押股票市值
        </p>
      </div>
    );
  }

  const style = STATUS_STYLES[status];
  const width = Math.min(100, Math.max(0, (ratio / FULL_BAR_RATIO) * 100));

  return (
    <div className="rounded-xl bg-white dark:bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            質押整戶維持率
          </p>
          {formulaButton}
        </div>
        <span
          data-testid="pledge-maintenance-status"
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style.badge}`}
        >
          {PLEDGE_MAINTENANCE_STATUS_LABEL[status]}
        </span>
      </div>
      <p
        data-testid="pledge-maintenance-value"
        className="mt-1 text-2xl font-bold text-slate-900 dark:text-neutral-50"
      >
        {formatPercent(ratio)}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
        <div
          data-testid="pledge-maintenance-bar-fill"
          className={`h-full rounded-full transition-all duration-100 ${style.bar}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <p
        data-testid="pledge-maintenance-drop"
        className="mt-2 text-xs text-slate-500 dark:text-neutral-400"
      >
        {dropToMarginCall === null
          ? "已低於追繳線，需補繳擔保品或還款"
          : `擔保品再下跌 ${formatPercent(dropToMarginCall)} 將觸及 ${PLEDGE_MARGIN_CALL_RATIO}% 追繳線`}
      </p>
    </div>
  );
}
