import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import type {
  GoalEstimates,
  GoalEta as GoalEtaResult,
} from "@/lib/calculations";
import {
  formatCurrency,
  formatMonthAfter,
  formatYearsAndMonths,
} from "@/lib/format";

interface GoalEtaProps {
  estimates: GoalEstimates;
  netWorth: number;
  targetNetWorth: number;
}

/** 一種速度的估算結果：可估算時顯示「約 X 年 Y 個月（預計 YYYY 年 M 月）」，否則以文字說明原因。 */
function EtaRow({
  testId,
  label,
  eta,
  baseDate,
  detail,
}: {
  testId: string;
  label: string;
  eta: GoalEtaResult;
  baseDate: string;
  /** 每月增加額的補充說明（來源或所比較的日期）。 */
  detail?: string;
}) {
  return (
    <div data-testid={testId} className="sm:flex sm:justify-between sm:gap-x-3">
      <dt className="text-sm text-slate-500 dark:text-neutral-400">{label}</dt>
      <dd className="sm:text-right">
        {eta.status === "ok" && eta.months !== null && (
          <p className="text-sm font-medium text-slate-900 dark:text-neutral-50">
            約 {formatYearsAndMonths(eta.months)}
            <span className="ml-1 font-normal text-slate-500 dark:text-neutral-400">
              （預計 {formatMonthAfter(baseDate, eta.months)}）
            </span>
          </p>
        )}
        {eta.status === "too-far" && (
          <p className="text-sm font-medium text-slate-900 dark:text-neutral-50">
            超過 100 年
          </p>
        )}
        {eta.status === "not-growing" && (
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
            淨資產沒有增加，無法估算
          </p>
        )}
        {eta.status === "no-data" && (
          <p className="text-sm text-slate-400 dark:text-neutral-400">
            需要相隔至少 30 天的兩筆已存檔快照
          </p>
        )}
        {eta.monthlyPace !== null && (
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            每月約{eta.monthlyPace < 0 ? "減少" : "增加"}{" "}
            {formatCurrency(Math.abs(eta.monthlyPace))}
            {detail && `（${detail}）`}
          </p>
        )}
      </dd>
    </div>
  );
}

/**
 * 目標達成時間預估（PRD 4.2、5.7a 節）：以「目前收支」與「歷史變化」兩種每月淨資產增加額，
 * 各自線性推算還要多久達成目標。未設定目標或已達成時不顯示。
 */
export function GoalEta({ estimates, netWorth, targetNetWorth }: GoalEtaProps) {
  const { budget, history, baseDate } = estimates;
  if (budget.status === "unset" || budget.status === "achieved") return null;

  const pace = budget.monthlyPace ?? 0;

  return (
    <div
      data-testid="goal-eta"
      className="mt-3 space-y-2 border-t border-slate-100 dark:border-border pt-3"
    >
      <div className="flex items-center gap-1">
        <p className="text-sm text-slate-500 dark:text-neutral-400">
          預估達成時間
        </p>
        <FormulaInfoButton
          title="預估達成時間"
          formula={
            "還需月數 = (目標淨資產 − 淨資產) ÷ 每月淨資產增加額（無條件進位）\n" +
            "依目前收支：每月增加額 = 現金流 + 本月償還的負債本金\n" +
            "依歷史變化：每月增加額 = 兩筆快照的淨資產差 ÷ 相隔天數 × (365.25 ÷ 12)"
          }
          substitution={
            `依目前收支：每月增加額 = ${formatCurrency(budget.cashFlow)} + ${formatCurrency(budget.principalRepayment)} = ${formatCurrency(pace)}` +
            (budget.status === "ok"
              ? `\n(${formatCurrency(targetNetWorth)} − ${formatCurrency(netWorth)}) ÷ ${formatCurrency(pace)} → ${budget.months} 個月`
              : "")
          }
          note="還本金只是把現金換成負債減少，淨資產不變，因此加回；每月增加額 ≤ 0 時無法估算，超過 100 年不顯示具體時間"
        />
      </div>
      <dl className="space-y-2">
        <EtaRow
          testId="goal-eta-budget"
          label="依目前收支"
          eta={budget}
          baseDate={baseDate}
          detail="現金流＋償還本金"
        />
        <EtaRow
          testId="goal-eta-history"
          label="依歷史變化"
          eta={history}
          baseDate={baseDate}
          detail={
            history.fromDate && history.toDate
              ? `${history.fromDate} → ${history.toDate}`
              : undefined
          }
        />
      </dl>
      <p className="text-xs text-slate-400 dark:text-neutral-400">
        線性估算，未計入未來的投資報酬、通膨與收支變動，僅供參考
      </p>
    </div>
  );
}
