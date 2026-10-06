import { daysBetweenDates } from "@/lib/dataFreshness";
import { getLatestSnapshot, parseFinanceData } from "@/lib/storage";
import type { FinanceData } from "@/types/schema";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD 日期字串往後平移 N 天；以 UTC 計算，避免夏令時間造成日期偏移。 */
function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/**
 * 把所有快照的日期整體平移相同天數，讓最新一筆落在 today（PRD 4.2「範例資料」）：
 * 各筆之間的間隔與所有數值不變，`updatedAt` 同步平移。沒有快照時原樣回傳。
 */
export function shiftSnapshotsToDate(
  data: FinanceData,
  today: string
): FinanceData {
  const latest = getLatestSnapshot(data);
  if (!latest) return data;
  const days = daysBetweenDates(latest.date, today);
  if (days === 0) return data;
  return {
    ...data,
    snapshots: data.snapshots.map((snapshot) => ({
      ...snapshot,
      date: shiftDate(snapshot.date, days),
      updatedAt: new Date(
        new Date(snapshot.updatedAt).getTime() + days * MS_PER_DAY
      ).toISOString(),
    })),
  };
}

/**
 * 載入範例資料（PRD 4.2「範例資料」）：與測試共用的 fixtures/finance-data.json，全部虛構。
 * 以動態 import 切成獨立的同源靜態檔，使用者按下按鈕才載入，不發出任何對外網路請求；
 * 內容走與匯入還原相同的 parseFinanceData 驗證與遷移。載入或驗證失敗時回傳 null。
 */
export async function loadDemoFinanceData(
  today: string
): Promise<FinanceData | null> {
  try {
    const { default: raw } =
      await import("../../fixtures/finance-data.json?raw");
    const result = parseFinanceData(raw);
    if (result.status !== "ok") return null;
    return shiftSnapshotsToDate(result.data, today);
  } catch {
    return null;
  }
}
