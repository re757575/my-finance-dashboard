import { beforeEach, describe, expect, it } from "vitest";
import {
  createEmptyFinanceData,
  getCurrentMonth,
  getLatestSnapshot,
  getRecentSnapshots,
  getSnapshotForMonth,
  parseFinanceData,
  upsertSnapshot,
} from "@/lib/storage";
import { createEmptySnapshot, CURRENT_SCHEMA_VERSION } from "@/types/schema";

function snapshot(month: string, amount: number) {
  return {
    ...createEmptySnapshot(month),
    cashSources: [{ id: "1", name: "現金", amount }],
  };
}

describe("upsertSnapshot", () => {
  // PRD 第 9 節 #11：同月多次存檔只保留最後一次
  it("同月存檔會覆蓋既有快照，不新增筆數", () => {
    let data = createEmptyFinanceData();
    data = upsertSnapshot(data, snapshot("2026-07", 1000));
    data = upsertSnapshot(data, snapshot("2026-07", 5000));

    expect(data.snapshots).toHaveLength(1);
    expect(getSnapshotForMonth(data, "2026-07")?.cashSources[0].amount).toBe(
      5000
    );
  });

  // PRD 第 9 節 #12：跨月存檔新增一筆，不影響前一筆
  it("跨月存檔新增一筆快照，既有月份不受影響", () => {
    let data = createEmptyFinanceData();
    data = upsertSnapshot(data, snapshot("2026-06", 1000));
    data = upsertSnapshot(data, snapshot("2026-07", 2000));

    expect(data.snapshots).toHaveLength(2);
    expect(getSnapshotForMonth(data, "2026-06")?.cashSources[0].amount).toBe(
      1000
    );
    expect(getSnapshotForMonth(data, "2026-07")?.cashSources[0].amount).toBe(
      2000
    );
  });
});

describe("getLatestSnapshot", () => {
  // PRD 第 9 節 #13：當月尚無快照時，取得上月資料供表單預帶
  it("回傳月份最大的快照，不受插入順序影響", () => {
    let data = createEmptyFinanceData();
    data = upsertSnapshot(data, snapshot("2026-07", 2000));
    data = upsertSnapshot(data, snapshot("2026-05", 500));
    data = upsertSnapshot(data, snapshot("2026-06", 1000));

    expect(getLatestSnapshot(data)?.month).toBe("2026-07");
  });

  it("沒有任何快照時回傳 undefined", () => {
    expect(getLatestSnapshot(createEmptyFinanceData())).toBeUndefined();
  });
});

describe("getRecentSnapshots", () => {
  // PRD 第 4.2 節：趨勢圖預設顯示最近 12 個月，資料本身不刪除
  it("只取最近 N 筆，但不影響底層資料", () => {
    // 產生跨年的 15 個連續月份：2025-05 ~ 2026-07
    const months = Array.from({ length: 15 }, (_, i) => {
      const date = new Date(2025, 4 + i, 1); // 月份從 0 開始，4 = 5 月
      return getCurrentMonth(date);
    });

    let data = createEmptyFinanceData();
    months.forEach((month, i) => {
      data = upsertSnapshot(data, snapshot(month, i));
    });

    const recent = getRecentSnapshots(data, 12);
    expect(recent).toHaveLength(12);
    expect(recent[0].month).toBe(months[3]); // 最後 12 筆的起點
    expect(recent.at(-1)?.month).toBe(months.at(-1));
    expect(data.snapshots).toHaveLength(15);
  });
});

describe("parseFinanceData", () => {
  // PRD 第 9 節 #15：資料毀損時視為無資料，不拋錯
  it("非合法 JSON 視為 corrupted", () => {
    expect(parseFinanceData("{not valid json")).toEqual({
      status: "corrupted",
    });
  });

  it("缺少 snapshots 欄位視為 corrupted", () => {
    expect(parseFinanceData(JSON.stringify({ schemaVersion: 1 }))).toEqual({
      status: "corrupted",
    });
  });

  // PRD 第 9 節 #16：schemaVersion 不符時不可覆蓋原始資料
  it("schemaVersion 不符時回傳 version-mismatch 並保留原始版本號", () => {
    const raw = JSON.stringify({ schemaVersion: 999, snapshots: [] });
    expect(parseFinanceData(raw)).toEqual({
      status: "version-mismatch",
      foundVersion: 999,
    });
  });

  it("尚無資料時回傳 empty", () => {
    expect(parseFinanceData(null)).toEqual({ status: "empty" });
  });

  it("合法資料回傳 ok 並保留內容", () => {
    const data = createEmptyFinanceData();
    const raw = JSON.stringify(data);
    expect(parseFinanceData(raw)).toEqual({ status: "ok", data });
  });
});

describe("getCurrentMonth", () => {
  it("格式化為 YYYY-MM", () => {
    expect(getCurrentMonth(new Date("2026-07-11T00:00:00"))).toBe("2026-07");
    expect(getCurrentMonth(new Date("2026-01-05T00:00:00"))).toBe("2026-01");
  });
});

describe("createEmptyFinanceData", () => {
  it("使用目前的 schemaVersion", () => {
    expect(createEmptyFinanceData().schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

beforeEach(() => {
  localStorage.clear();
});
