/** 距上次備份超過此天數（不含）即提醒（PRD 4.2「備份提醒」）。 */
export const BACKUP_REMINDER_DAYS = 30;
/** 距上次更新超過此天數（不含）即標示資料可能已過期（PRD 4.2「資料新鮮度提示」）。 */
export const STALE_DATA_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 兩個 YYYY-MM-DD 日期字串的曆日差（只看日期、忽略時間）。以 UTC 計算避免夏令時間造成 23/25 小時的誤差；
 * 結束日早於起始日時回傳負數。
 */
export function daysBetweenDates(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY
  );
}

export type DataFreshnessStatus = "today" | "fresh" | "stale";

export interface DataFreshness {
  /** 距上次更新的天數；今天為 0。 */
  days: number;
  /** 最近一筆已存檔快照的日期。 */
  lastDate: string;
  status: DataFreshnessStatus;
}

/**
 * 資料新鮮度（PRD 4.2）：以最近一筆已存檔快照的日期為準，不看今日草稿是否有未存檔的異動。
 * 沒有任何快照時回傳 null（不顯示）。
 */
export function getDataFreshness(
  latestSnapshotDate: string | undefined,
  currentDate: string
): DataFreshness | null {
  if (!latestSnapshotDate) return null;
  const days = Math.max(0, daysBetweenDates(latestSnapshotDate, currentDate));
  return {
    days,
    lastDate: latestSnapshotDate,
    status: days === 0 ? "today" : days > STALE_DATA_DAYS ? "stale" : "fresh",
  };
}

export interface BackupReminder {
  /** 是否達到提醒條件（天數大於 BACKUP_REMINDER_DAYS）。 */
  shouldRemind: boolean;
  /** 從未備份過（此時 days 為距最早一筆快照的天數）。 */
  neverBackedUp: boolean;
  days: number;
}

/**
 * 備份提醒（PRD 4.2）：已有快照且距上次備份超過 30 天才提醒；從未備份過者以最早一筆快照日期起算。
 * lastBackupDate 為「上次備份的日期」（YYYY-MM-DD）。沒有任何快照時不提醒。
 */
export function getBackupReminder(params: {
  lastBackupDate: string | null;
  earliestSnapshotDate: string | undefined;
  currentDate: string;
}): BackupReminder {
  const { lastBackupDate, earliestSnapshotDate, currentDate } = params;
  const neverBackedUp = lastBackupDate === null;
  const reference = lastBackupDate ?? earliestSnapshotDate;
  if (!earliestSnapshotDate || !reference) {
    return { shouldRemind: false, neverBackedUp, days: 0 };
  }
  const days = Math.max(0, daysBetweenDates(reference, currentDate));
  return { shouldRemind: days > BACKUP_REMINDER_DAYS, neverBackedUp, days };
}
