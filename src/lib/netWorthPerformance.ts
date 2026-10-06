import { calculateMetrics } from "@/lib/calculations";
import { daysBetweenDates } from "@/lib/dataFreshness";
import type { Snapshot } from "@/types/schema";

/** 統計期間至少要滿這麼多天才年化；未滿時只給期間成長率（PRD 5.11 節「未滿 1 年不年化」）。 */
export const ANNUALIZE_MIN_DAYS = 365;
/** 年化時一年的天數（含閏年平均）。 */
export const DAYS_PER_YEAR = 365.25;

/** 最大回撤：依時間順序，從「至今最高點」到其後最低點的最大跌幅（PRD 5.11 節）。 */
export interface NetWorthDrawdown {
  /** 跌幅百分比，正數（例如 12.5 代表從高點下跌 12.5%）。 */
  percent: number;
  /** 跌幅金額（高點 − 低點），正數。 */
  amount: number;
  /** 高點日期；同一個高點數值出現多次時，取下跌前最近的一次。 */
  peakDate: string;
  peakNetWorth: number;
  troughDate: string;
  troughNetWorth: number;
  /** 低點之後是否有任一筆快照的淨資產回到該高點以上（含相等）。 */
  recovered: boolean;
}

export interface NetWorthPerformance {
  /** 範圍內最早一筆快照的日期。 */
  startDate: string;
  /** 範圍內最新一筆快照的日期。 */
  endDate: string;
  /** 首末兩筆快照相隔的曆日數。 */
  days: number;
  startNetWorth: number;
  endNetWorth: number;
  /** 期末 − 期初。 */
  change: number;
  /** 期間成長率（%）；期初淨資產 ≤ 0 時不具比較意義，為 null。 */
  periodReturn: number | null;
  /**
   * 年化成長率 CAGR（%）。期間未滿 ANNUALIZE_MIN_DAYS 天時不年化（短期間年化會嚴重誇大），為 null；
   * 期初 ≤ 0 或期末 < 0 時無法計算，也為 null。
   */
  annualizedReturn: number | null;
  /** 最大回撤；期間內淨資產從未自「正的高點」下跌時為 null。 */
  maxDrawdown: NetWorthDrawdown | null;
  /**
   * 淨資產曾經下跌、但下跌前的高點 ≤ 0（跌幅百分比沒有意義，不列入最大回撤）。
   * maxDrawdown 為 null 且此值為 true 時，畫面不可寫成「沒有回撤」。
   */
  hasUnmeasurableDecline: boolean;
}

interface NetWorthPoint {
  date: string;
  netWorth: number;
}

/** 計算結果若不是有限數字（極端輸入造成溢位）一律視為無法計算，避免畫面出現 NaN／Infinity。 */
function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function calculatePeriodReturn(start: number, end: number): number | null {
  if (start <= 0) return null;
  return finiteOrNull(((end - start) / start) * 100);
}

function calculateAnnualizedReturn(
  start: number,
  end: number,
  days: number
): number | null {
  if (days < ANNUALIZE_MIN_DAYS) return null;
  // 期初 ≤ 0 時比值沒有意義；期末 < 0 時比值為負、無法開方
  if (start <= 0 || end < 0) return null;
  return finiteOrNull(((end / start) ** (DAYS_PER_YEAR / days) - 1) * 100);
}

/** points 須已依日期遞增排序。 */
function calculateMaxDrawdown(points: NetWorthPoint[]): {
  maxDrawdown: NetWorthDrawdown | null;
  hasUnmeasurableDecline: boolean;
} {
  let peak = points[0];
  let worst: { peak: NetWorthPoint; troughIndex: number } | null = null;
  let worstPercent = 0;
  let hasUnmeasurableDecline = false;

  for (let index = 1; index < points.length; index++) {
    const point = points[index];
    // 回到高點（含相等）就把高點日期往後移：回撤從「下跌前最近一次的高點」起算
    if (point.netWorth >= peak.netWorth) {
      peak = point;
      continue;
    }
    if (peak.netWorth <= 0) {
      hasUnmeasurableDecline = true;
      continue;
    }
    const percent = ((peak.netWorth - point.netWorth) / peak.netWorth) * 100;
    // 跌幅相同時保留較早發生的那一段
    if (Number.isFinite(percent) && percent > worstPercent) {
      worstPercent = percent;
      worst = { peak, troughIndex: index };
    }
  }

  if (worst === null) return { maxDrawdown: null, hasUnmeasurableDecline };

  const worstPeak = worst.peak;
  const trough = points[worst.troughIndex];
  return {
    maxDrawdown: {
      percent: worstPercent,
      amount: worstPeak.netWorth - trough.netWorth,
      peakDate: worstPeak.date,
      peakNetWorth: worstPeak.netWorth,
      troughDate: trough.date,
      troughNetWorth: trough.netWorth,
      recovered: points
        .slice(worst.troughIndex + 1)
        .some((point) => point.netWorth >= worstPeak.netWorth),
    },
    hasUnmeasurableDecline,
  };
}

/**
 * 淨資產成長率與最大回撤（PRD 4.2「淨資產成長率與最大回撤」、5.11 節）：純函式，輸入一組已存檔快照
 * （順序不拘，函式內依日期排序），每筆的淨資產各自以該筆快照的欄位經 calculateMetrics() 計算。
 * 少於 2 筆無法構成一段期間，回傳 null。不讀取也不寫入任何其他資料。
 *
 * 注意：淨資產變化包含儲蓄投入與負債償還，這裡算的不是投資報酬率。
 */
export function calculateNetWorthPerformance(
  snapshots: Snapshot[]
): NetWorthPerformance | null {
  if (snapshots.length < 2) return null;

  const points: NetWorthPoint[] = [...snapshots]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((snapshot) => ({
      date: snapshot.date,
      netWorth: calculateMetrics(snapshot).netWorth,
    }));
  const first = points[0];
  const last = points[points.length - 1];
  const days = daysBetweenDates(first.date, last.date);

  return {
    startDate: first.date,
    endDate: last.date,
    days,
    startNetWorth: first.netWorth,
    endNetWorth: last.netWorth,
    change: last.netWorth - first.netWorth,
    periodReturn: calculatePeriodReturn(first.netWorth, last.netWorth),
    annualizedReturn: calculateAnnualizedReturn(
      first.netWorth,
      last.netWorth,
      days
    ),
    ...calculateMaxDrawdown(points),
  };
}
