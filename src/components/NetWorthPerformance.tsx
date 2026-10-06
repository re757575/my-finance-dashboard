import { useMemo } from "react";
import { DeltaText } from "@/components/charts/DeltaText";
import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  ANNUALIZE_MIN_DAYS,
  calculateNetWorthPerformance,
  DAYS_PER_YEAR,
  type NetWorthPerformance as NetWorthPerformanceResult,
} from "@/lib/netWorthPerformance";
import type { Snapshot } from "@/types/schema";

interface NetWorthPerformanceProps {
  /** 目前趨勢圖範圍內的已存檔快照（順序不拘）；不含今日未存檔的草稿。 */
  snapshots: Snapshot[];
}

const LABEL_CLASS = "text-xs text-slate-500 dark:text-neutral-400";
const VALUE_CLASS = "text-lg font-semibold";
const DETAIL_CLASS = "text-xs text-slate-500 dark:text-neutral-400";

/** 四捨五入到畫面顯示的精度（小數一位），避免極小的差異顯示成「▲ 0.0%」。 */
function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatSignedPercent(value: number): string {
  const rounded = roundPercent(value);
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

function formatDays(days: number): string {
  return new Intl.NumberFormat("en-US").format(days);
}

interface GrowthDisplay {
  label: "年化成長率" | "期間成長率";
  /** 成長率（%）；無法計算時為 null，畫面顯示「—」。 */
  value: number | null;
  note: string;
}

/**
 * 成長率要顯示哪一個數字（PRD 5.11 節）：滿 1 年且可年化才顯示年化成長率，
 * 否則退回期間成長率並說明為什麼不年化；期初淨資產 ≤ 0 時兩者都無法計算。
 */
function describeGrowth(performance: NetWorthPerformanceResult): GrowthDisplay {
  const { annualizedReturn, periodReturn, days } = performance;
  if (annualizedReturn !== null && periodReturn !== null) {
    return {
      label: "年化成長率",
      value: annualizedReturn,
      note: `期間累計 ${formatSignedPercent(periodReturn)}`,
    };
  }
  if (periodReturn === null) {
    return {
      label: days < ANNUALIZE_MIN_DAYS ? "期間成長率" : "年化成長率",
      value: null,
      note: "期初淨資產不為正，無法計算成長率",
    };
  }
  return {
    label: "期間成長率",
    value: periodReturn,
    note:
      days < ANNUALIZE_MIN_DAYS
        ? "未滿 1 年不年化"
        : "期末淨資產為負，無法年化",
  };
}

/** 公式說明小浮窗內「代入實際數值」的計算過程，逐行對應公式的三個指標。 */
function buildSubstitution(performance: NetWorthPerformanceResult): string {
  const {
    startNetWorth,
    endNetWorth,
    days,
    periodReturn,
    annualizedReturn,
    maxDrawdown,
    hasUnmeasurableDecline,
  } = performance;
  const start = formatCurrency(startNetWorth);
  const end = formatCurrency(endNetWorth);

  let annualizedLine: string;
  if (annualizedReturn !== null) {
    annualizedLine = `(${end} ÷ ${start})^(${DAYS_PER_YEAR} ÷ ${days}) − 1 = ${formatPercent(annualizedReturn)}`;
  } else if (days < ANNUALIZE_MIN_DAYS) {
    annualizedLine = `年化：期間 ${formatDays(days)} 天，未滿 1 年不年化`;
  } else {
    annualizedLine = "年化：期初淨資產不為正或期末淨資產為負，無法計算";
  }

  const periodLine =
    periodReturn !== null
      ? `(${end} − ${start}) ÷ ${start} × 100% = ${formatPercent(periodReturn)}`
      : "期間成長率：期初淨資產不為正，無法計算";

  let drawdownLine: string;
  if (maxDrawdown !== null) {
    const peak = formatCurrency(maxDrawdown.peakNetWorth);
    const trough = formatCurrency(maxDrawdown.troughNetWorth);
    drawdownLine = `(${peak} − ${trough}) ÷ ${peak} × 100% = ${formatPercent(maxDrawdown.percent)}`;
  } else if (hasUnmeasurableDecline) {
    drawdownLine = "最大回撤：高點不為正，無法計算跌幅";
  } else {
    drawdownLine = "最大回撤：期間內沒有回撤";
  }

  return [annualizedLine, periodLine, drawdownLine].join("\n");
}

/**
 * 淨資產成長率與最大回撤摘要卡（PRD 4.2「淨資產成長率與最大回撤」、5.11 節）：以目前趨勢圖範圍內的
 * 已存檔快照即時計算，放在歷史趨勢圖區的分頁上方。少於 2 筆時不顯示（趨勢圖本身已有空狀態）。
 * 增減沿用 DeltaText 的呈現（增加 ▲ rose、減少 ▼ emerald、相同顯示「持平」），不寫入任何資料。
 */
export function NetWorthPerformance({ snapshots }: NetWorthPerformanceProps) {
  const performance = useMemo(
    () => calculateNetWorthPerformance(snapshots),
    [snapshots]
  );
  if (performance === null) return null;

  const { startDate, endDate, days, maxDrawdown } = performance;
  const growth = describeGrowth(performance);
  // 以畫面顯示的四捨五入後金額相減，與公式說明內的期初／期末金額對得起來
  const displayChange =
    Math.round(performance.endNetWorth) - Math.round(performance.startNetWorth);

  return (
    <div
      data-testid="net-worth-performance"
      className="rounded-xl bg-white dark:bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-1">
          <h3 className="text-sm text-slate-500 dark:text-neutral-400">
            淨資產成長率與最大回撤
          </h3>
          <FormulaInfoButton
            title="淨資產成長率與最大回撤"
            formula={[
              "年化成長率 =（期末 ÷ 期初）^(365.25 ÷ 天數) − 1",
              "期間成長率 =（期末 − 期初）÷ 期初 × 100%",
              "最大回撤 =（高點 − 其後最低點）÷ 高點 × 100%",
            ].join("\n")}
            substitution={buildSubstitution(performance)}
            note="未滿 365 天不年化；期初淨資產 ≤ 0 時不計算成長率。只計入已存檔的快照，兩筆之間的高低點看不到，實際回撤可能更大。"
          />
        </div>
        <p
          data-testid="net-worth-performance-period"
          className="text-xs text-slate-500 dark:text-neutral-400"
        >
          統計期間 {startDate} ～ {endDate}（{formatDays(days)} 天）
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className={LABEL_CLASS}>淨資產變化</dt>
          <dd data-testid="net-worth-change-value" className={VALUE_CLASS}>
            <DeltaText
              delta={displayChange}
              percent={null}
              formatValue={formatCurrency}
            />
          </dd>
        </div>

        <div className="min-w-0">
          <dt data-testid="net-worth-growth-label" className={LABEL_CLASS}>
            {growth.label}
          </dt>
          <dd data-testid="net-worth-growth-value" className={VALUE_CLASS}>
            {growth.value === null ? (
              <span className="text-slate-400 dark:text-neutral-400">—</span>
            ) : (
              <DeltaText
                delta={roundPercent(growth.value)}
                percent={null}
                formatValue={formatPercent}
              />
            )}
          </dd>
          <dd data-testid="net-worth-growth-note" className={DETAIL_CLASS}>
            {growth.note}
          </dd>
        </div>

        <div className="min-w-0">
          <dt className={LABEL_CLASS}>最大回撤</dt>
          {maxDrawdown === null ? (
            <dd
              data-testid="net-worth-drawdown-value"
              className="text-sm text-slate-500 dark:text-neutral-400"
            >
              {performance.hasUnmeasurableDecline
                ? "高點不為正，無法計算跌幅"
                : "期間內沒有回撤"}
            </dd>
          ) : (
            <>
              <dd
                data-testid="net-worth-drawdown-value"
                className={VALUE_CLASS}
              >
                {/* 回撤一律是下跌，以負的增減交給 DeltaText 呈現為「▼ x.x%」 */}
                <DeltaText
                  delta={-maxDrawdown.percent}
                  percent={null}
                  formatValue={formatPercent}
                />
              </dd>
              <dd
                data-testid="net-worth-drawdown-detail"
                className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${DETAIL_CLASS}`}
              >
                <span className="whitespace-nowrap">
                  下跌 {formatCurrency(maxDrawdown.amount)}
                </span>
                <span className="whitespace-nowrap">
                  {maxDrawdown.peakDate} → {maxDrawdown.troughDate}
                </span>
                <span
                  data-testid="net-worth-drawdown-recovery"
                  className={
                    maxDrawdown.recovered
                      ? "rounded-full bg-slate-100 dark:bg-muted px-2 py-0.5 font-medium text-slate-600 dark:text-neutral-300"
                      : "rounded-full bg-amber-50 dark:bg-amber-950 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300"
                  }
                >
                  {maxDrawdown.recovered ? "已回復" : "尚未回復"}
                </span>
              </dd>
            </>
          )}
        </div>
      </dl>

      <p className="mt-3 text-xs text-slate-500 dark:text-neutral-400">
        淨資產變化包含儲蓄投入與負債償還，不等於投資報酬率。
      </p>
    </div>
  );
}
