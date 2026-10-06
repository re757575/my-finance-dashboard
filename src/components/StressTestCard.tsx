import { useState } from "react";
import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import {
  calculateStressBreakpoints,
  calculateStressScenario,
  DEBT_RATIO_STATUS_LABEL,
  PLEDGE_MAINTENANCE_STATUS_LABEL,
  PLEDGE_MARGIN_CALL_RATIO,
  STRESS_BREAKPOINT_DEBT_RATIOS,
  STRESS_TEST_DROPS,
} from "@/lib/calculations";
import type {
  calculateMetrics,
  StressBreakpoint,
  StressBreakpointKey,
} from "@/lib/calculations";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DebtRatioStatus, PledgeMaintenanceStatus } from "@/types/schema";

const DEFAULT_DROP = 20;

const DEBT_STATUS_STYLE: Record<DebtRatioStatus, string> = {
  "debt-free":
    "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
  healthy: "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300",
  elevated: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
  "high-risk": "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300",
};

const PLEDGE_STATUS_STYLE: Record<
  Exclude<PledgeMaintenanceStatus, "none" | "unset">,
  string
> = {
  safe: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
  watch: "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300",
  warning: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
  "margin-call": "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300",
};

/** 臨界點各條線的說明文字：event 用於「股票再下跌 X% → …」與「不會觸及」，reached 用於「已觸及」。 */
const BREAKPOINT_TEXT: Record<
  StressBreakpointKey,
  { event: string; reached: string }
> = {
  "pledge-margin-call": {
    event: `質押維持率觸及 ${PLEDGE_MARGIN_CALL_RATIO}% 追繳線`,
    reached: `質押維持率已在 ${PLEDGE_MARGIN_CALL_RATIO}% 追繳線或以下`,
  },
  "debt-ratio-elevated": {
    event: `負債比升至 ${STRESS_BREAKPOINT_DEBT_RATIOS.elevated}%（進入「負債偏高」）`,
    reached: `負債比已達 ${STRESS_BREAKPOINT_DEBT_RATIOS.elevated}% 以上`,
  },
  "debt-ratio-high-risk": {
    event: `負債比升至 ${STRESS_BREAKPOINT_DEBT_RATIOS.highRisk}%（再跌即進入「財務高風險」）`,
    reached: `負債比已達 ${STRESS_BREAKPOINT_DEBT_RATIOS.highRisk}% 以上`,
  },
  "net-worth-zero": {
    event: "淨資產歸零",
    reached: "淨資產已歸零或為負數",
  },
};

/** 臨界跌幅顯示到小數一位；四捨五入後會變成 0.0% 的極小跌幅改顯示「不到 0.1%」，避免看起來像還沒開始跌。 */
function formatBreakpointDrop(dropPercent: number): string {
  return dropPercent < 0.05 ? "不到 0.1%" : formatPercent(dropPercent);
}

interface StressTestCardProps {
  /** 今日草稿（含尚未存檔的異動），與其他當下狀態卡片一致（PRD 4.2 節）。 */
  snapshot: Parameters<typeof calculateMetrics>[0];
}

/**
 * 股票壓力測試卡（PRD 4.2、5.9 節）：一鍵切換 −10%／−20%／−30% 情境，
 * 以「現況 → 情境」呈現股票市值、淨資產、負債比與質押整戶維持率。
 * 情境結果下方另列「臨界點」（PRD 5.9a 節）：反推股票再下跌多少會碰到各條風險線，與所選情境無關。
 * 股票市值合計為 0（沒有可下跌的部位）時整區不顯示。純即時試算，不改動任何輸入或存檔資料。
 */
export function StressTestCard({ snapshot }: StressTestCardProps) {
  const [drop, setDrop] = useState<number>(DEFAULT_DROP);
  const { before, after, netWorthChange, netWorthChangeRate } =
    calculateStressScenario(snapshot, drop);

  if (before.totalStockValue <= 0) return null;

  const showPledge =
    before.pledgeMaintenanceRatio !== null &&
    after.pledgeMaintenanceRatio !== null &&
    after.pledgeMaintenanceStatus !== "none" &&
    after.pledgeMaintenanceStatus !== "unset";
  const marginCall =
    showPledge && after.pledgeMaintenanceStatus === "margin-call";
  const rateNote =
    netWorthChangeRate === null ? "" : `，${formatPercent(netWorthChangeRate)}`;
  const breakpoints = calculateStressBreakpoints(snapshot);
  const breakpointSubstitution = breakpoints
    .filter((breakpoint) => breakpoint.status === "drop")
    .map((breakpoint) => {
      const result = formatBreakpointDrop(breakpoint.dropPercent as number);
      switch (breakpoint.key) {
        case "pledge-margin-call":
          return `追繳線：1 − ${PLEDGE_MARGIN_CALL_RATIO}% ÷ ${formatPercent(before.pledgeMaintenanceRatio as number)} = ${result}`;
        case "net-worth-zero":
          return `淨資產歸零：${formatCurrency(before.netWorth)} ÷ ${formatCurrency(before.totalStockValue)} = ${result}`;
        default: {
          const threshold =
            breakpoint.key === "debt-ratio-elevated"
              ? STRESS_BREAKPOINT_DEBT_RATIOS.elevated
              : STRESS_BREAKPOINT_DEBT_RATIOS.highRisk;
          return `負債比 ${threshold}%：(${formatCurrency(before.totalAssets)} − ${formatCurrency(before.totalLiabilities)} ÷ ${threshold}%) ÷ ${formatCurrency(before.totalStockValue)} = ${result}`;
        }
      }
    });

  return (
    <div className="rounded-xl bg-white dark:bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            壓力測試
          </p>
          <FormulaInfoButton
            title="壓力測試"
            formula={[
              "情境淨資產 = 現金 + 股票市值 × (1 − 下跌%) + 不動產 − 總負債",
              "情境維持率 = 質押股票市值 × (1 − 下跌%) ÷ 質押本金 × 100%",
              "臨界點（股票再下跌多少會碰到該線）：",
              "負債比升至 T% = (總資產 − 總負債 ÷ T%) ÷ 股票市值",
              "淨資產歸零 = 淨資產 ÷ 股票市值",
              `追繳線 = 1 − ${PLEDGE_MARGIN_CALL_RATIO}% ÷ 質押維持率`,
            ].join("\n")}
            substitution={[
              `股票：${formatCurrency(before.totalStockValue)} × (1 − ${drop}%) = ${formatCurrency(after.totalStockValue)}`,
              `淨資產：${formatCurrency(before.netWorth)} → ${formatCurrency(after.netWorth)}`,
              `負債比：${formatCurrency(after.totalLiabilities)} ÷ ${formatCurrency(after.totalAssets)} × 100% = ${formatPercent(after.debtRatio)}`,
              ...breakpointSubstitution,
            ].join("\n")}
            note="台股與美股同步下跌，質押股票市值同比例下跌；現金、不動產、負債本金與匯率不變。臨界點算出的跌幅 ≤ 0 為「已觸及」、超過 100%（股票跌到 0 也碰不到）為「不會觸及」。簡化的即時試算，不預測機率，也未考慮個股差異與實際追繳規定"
          />
        </div>
        <div
          role="group"
          aria-label="股票下跌情境"
          className="inline-flex rounded-full border border-slate-200 dark:border-border p-0.5 text-xs"
        >
          {STRESS_TEST_DROPS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={drop === value}
              onClick={() => setDrop(value)}
              className={cn(
                "rounded-full px-2.5 py-0.5 font-medium transition-colors",
                drop === value
                  ? "bg-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200"
              )}
            >
              {`\u2212${value}%`}
            </button>
          ))}
        </div>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <Row label="股票市值合計">
          <span data-testid="stress-test-stock">
            {formatCurrency(before.totalStockValue)} →{" "}
            {formatCurrency(after.totalStockValue)}
          </span>
        </Row>
        <Row label="淨資產">
          <span
            data-testid="stress-test-net-worth"
            className={cn(
              after.netWorth < 0 && "text-rose-600 dark:text-rose-400"
            )}
          >
            {formatCurrency(before.netWorth)} → {formatCurrency(after.netWorth)}
          </span>
          <span
            data-testid="stress-test-net-worth-change"
            className="ml-2 text-xs text-slate-500 dark:text-neutral-400"
          >
            （{formatCurrency(netWorthChange)}
            {rateNote}）
          </span>
        </Row>
        <Row label="負債比">
          <span data-testid="stress-test-debt-ratio">
            {formatPercent(before.debtRatio)} → {formatPercent(after.debtRatio)}
          </span>
          <span
            data-testid="stress-test-debt-status"
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${DEBT_STATUS_STYLE[after.debtRatioStatus]}`}
          >
            {DEBT_RATIO_STATUS_LABEL[after.debtRatioStatus]}
          </span>
        </Row>
        {showPledge && (
          <Row label="質押整戶維持率">
            <span data-testid="stress-test-pledge-ratio">
              {formatPercent(before.pledgeMaintenanceRatio as number)} →{" "}
              {formatPercent(after.pledgeMaintenanceRatio as number)}
            </span>
            <span
              data-testid="stress-test-pledge-status"
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${PLEDGE_STATUS_STYLE[after.pledgeMaintenanceStatus as keyof typeof PLEDGE_STATUS_STYLE]}`}
            >
              {
                PLEDGE_MAINTENANCE_STATUS_LABEL[
                  after.pledgeMaintenanceStatus as keyof typeof PLEDGE_MAINTENANCE_STATUS_LABEL
                ]
              }
            </span>
          </Row>
        )}
      </dl>

      {marginCall && (
        <p
          data-testid="stress-test-margin-call-warning"
          className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950 px-3 py-2 text-sm font-medium text-rose-700 dark:text-rose-300"
        >
          此情境下質押維持率將低於 {PLEDGE_MARGIN_CALL_RATIO}% 追繳線
        </p>
      )}

      <div
        data-testid="stress-breakpoints"
        className="mt-3 border-t border-slate-100 dark:border-border pt-3"
      >
        <p className="text-sm font-medium text-slate-700 dark:text-neutral-200">
          臨界點
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-neutral-400">
          股票再下跌多少會碰到各條風險線，與上方選擇的情境無關
        </p>
        <ul className="mt-2 space-y-1.5 text-sm">
          {breakpoints.map((breakpoint) => (
            <BreakpointItem key={breakpoint.key} breakpoint={breakpoint} />
          ))}
        </ul>
      </div>

      <p className="mt-3 text-xs text-slate-400 dark:text-neutral-400">
        僅為簡化的即時試算，未考量匯率變動、個股差異與融資追繳的實際規定
      </p>
    </div>
  );
}

const BREAKPOINT_BADGE_CLASS =
  "mr-2 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

/** 單一臨界點：狀態一律有文字（已觸及／股票再下跌 X%／不會觸及），不只靠顏色區分（PRD 第 7 節）。 */
function BreakpointItem({ breakpoint }: { breakpoint: StressBreakpoint }) {
  const text = BREAKPOINT_TEXT[breakpoint.key];
  return (
    <li
      data-testid={`stress-breakpoint-${breakpoint.key}`}
      data-status={breakpoint.status}
      className="text-slate-600 dark:text-neutral-300"
    >
      {breakpoint.status === "reached" && (
        <>
          <span
            className={`${BREAKPOINT_BADGE_CLASS} bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300`}
          >
            已觸及
          </span>
          {text.reached}
        </>
      )}
      {breakpoint.status === "drop" && (
        <>
          <span className="font-medium text-slate-900 dark:text-neutral-50">
            股票再下跌 {formatBreakpointDrop(breakpoint.dropPercent as number)}
          </span>
          {" → "}
          {text.event}
        </>
      )}
      {breakpoint.status === "unreachable" && (
        <>
          <span
            className={`${BREAKPOINT_BADGE_CLASS} bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300`}
          >
            不會觸及
          </span>
          {text.event}
          <span className="text-slate-500 dark:text-neutral-400">
            （股票跌到 0 也碰不到）
          </span>
        </>
      )}
    </li>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-slate-500 dark:text-neutral-400">{label}</dt>
      <dd className="font-medium text-slate-900 dark:text-neutral-50">
        {children}
      </dd>
    </div>
  );
}
