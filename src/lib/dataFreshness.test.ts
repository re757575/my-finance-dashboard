import { describe, expect, it } from "vitest";
import {
  BACKUP_REMINDER_DAYS,
  daysBetweenDates,
  getBackupReminder,
  getDataFreshness,
  STALE_DATA_DAYS,
} from "@/lib/dataFreshness";

describe("常數", () => {
  it("備份提醒門檻 30 天、資料過期門檻 14 天", () => {
    expect(BACKUP_REMINDER_DAYS).toBe(30);
    expect(STALE_DATA_DAYS).toBe(14);
  });
});

describe("daysBetweenDates", () => {
  it("同一天為 0", () => {
    expect(daysBetweenDates("2026-09-30", "2026-09-30")).toBe(0);
  });

  it("只看日期，逐日累加", () => {
    expect(daysBetweenDates("2026-09-25", "2026-09-30")).toBe(5);
    expect(daysBetweenDates("2026-09-29", "2026-09-30")).toBe(1);
  });

  it("跨月、跨年正確計算", () => {
    expect(daysBetweenDates("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetweenDates("2025-12-25", "2026-01-05")).toBe(11);
    expect(daysBetweenDates("2025-09-30", "2026-09-30")).toBe(365);
  });

  it("閏年 2 月有 29 天", () => {
    expect(daysBetweenDates("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetweenDates("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("跨夏令時間的日期，差距仍為整數天（不受 23／25 小時影響）", () => {
    expect(daysBetweenDates("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetweenDates("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("結束日早於起始日時回傳負數", () => {
    expect(daysBetweenDates("2026-09-30", "2026-09-25")).toBe(-5);
  });
});

// PRD 第 9 節 #47～#47d：資料新鮮度
describe("getDataFreshness", () => {
  const today = "2026-09-30";

  it("最近一筆快照就是今天：today、0 天", () => {
    expect(getDataFreshness("2026-09-30", today)).toEqual({
      days: 0,
      lastDate: "2026-09-30",
      status: "today",
    });
  });

  it("數天前：fresh，帶出天數與日期", () => {
    expect(getDataFreshness("2026-09-25", today)).toEqual({
      days: 5,
      lastDate: "2026-09-25",
      status: "fresh",
    });
  });

  it("恰為 14 天仍不算過期；15 天才是 stale", () => {
    expect(getDataFreshness("2026-09-16", today)?.status).toBe("fresh");
    expect(getDataFreshness("2026-09-16", today)?.days).toBe(14);
    expect(getDataFreshness("2026-09-15", today)?.status).toBe("stale");
    expect(getDataFreshness("2026-09-15", today)?.days).toBe(15);
  });

  it("沒有任何快照時回傳 null（不顯示）", () => {
    expect(getDataFreshness(undefined, today)).toBeNull();
  });

  it("最近一筆快照日期晚於今天（例如電腦日期被調整）時，天數不為負，視為今日", () => {
    expect(getDataFreshness("2026-10-05", today)).toMatchObject({
      days: 0,
      status: "today",
    });
  });
});

// PRD 第 9 節 #46～#46e：備份提醒
describe("getBackupReminder", () => {
  const currentDate = "2026-09-30";

  it("有備份紀錄且超過 30 天：提醒", () => {
    expect(
      getBackupReminder({
        lastBackupDate: "2026-08-30", // 31 天前
        earliestSnapshotDate: "2026-01-01",
        currentDate,
      })
    ).toEqual({ shouldRemind: true, neverBackedUp: false, days: 31 });
  });

  it("恰為 30 天不提醒（條件為大於 30 天）", () => {
    expect(
      getBackupReminder({
        lastBackupDate: "2026-08-31", // 30 天前
        earliestSnapshotDate: "2026-01-01",
        currentDate,
      })
    ).toEqual({ shouldRemind: false, neverBackedUp: false, days: 30 });
  });

  it("今天剛備份：不提醒，0 天", () => {
    expect(
      getBackupReminder({
        lastBackupDate: "2026-09-30",
        earliestSnapshotDate: "2026-01-01",
        currentDate,
      })
    ).toEqual({ shouldRemind: false, neverBackedUp: false, days: 0 });
  });

  it("從未備份過：以最早一筆快照日期起算，超過 30 天才提醒", () => {
    expect(
      getBackupReminder({
        lastBackupDate: null,
        earliestSnapshotDate: "2026-08-16", // 45 天前
        currentDate,
      })
    ).toEqual({ shouldRemind: true, neverBackedUp: true, days: 45 });

    expect(
      getBackupReminder({
        lastBackupDate: null,
        earliestSnapshotDate: "2026-09-20", // 10 天前
        currentDate,
      })
    ).toEqual({ shouldRemind: false, neverBackedUp: true, days: 10 });
  });

  it("從未備份、且第一筆快照就是今天：不提醒（避免新用戶第一天被提醒）", () => {
    expect(
      getBackupReminder({
        lastBackupDate: null,
        earliestSnapshotDate: "2026-09-30",
        currentDate,
      }).shouldRemind
    ).toBe(false);
  });

  it("沒有任何快照時不提醒，即使從未備份、或備份紀錄很久以前", () => {
    expect(
      getBackupReminder({
        lastBackupDate: null,
        earliestSnapshotDate: undefined,
        currentDate,
      }).shouldRemind
    ).toBe(false);
    expect(
      getBackupReminder({
        lastBackupDate: "2020-01-01",
        earliestSnapshotDate: undefined,
        currentDate,
      }).shouldRemind
    ).toBe(false);
  });
});
