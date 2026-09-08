import { beforeEach, describe, expect, it } from "vitest";
import {
  createEmptyFinanceData,
  getCurrentDate,
  getLatestSnapshot,
  getSnapshotForDate,
  getSnapshotsInRange,
  monthsBetweenDates,
  parseFinanceData,
  upsertSnapshot,
} from "@/lib/storage";
import { createEmptySnapshot, CURRENT_SCHEMA_VERSION } from "@/types/schema";

function snapshot(date: string, amount: number) {
  return {
    ...createEmptySnapshot(date),
    cashSources: [{ id: "1", name: "現金", amount }],
  };
}

describe("upsertSnapshot", () => {
  // PRD 第 9 節 #11：同日多次存檔只保留最後一次
  it("同日存檔會覆蓋既有快照，不新增筆數", () => {
    let data = createEmptyFinanceData();
    data = upsertSnapshot(data, snapshot("2026-07-13", 1000));
    data = upsertSnapshot(data, snapshot("2026-07-13", 5000));

    expect(data.snapshots).toHaveLength(1);
    expect(getSnapshotForDate(data, "2026-07-13")?.cashSources[0].amount).toBe(
      5000
    );
  });

  // PRD 第 9 節 #12：跨日存檔新增一筆，不影響前一筆
  it("跨日存檔新增一筆快照，既有日期不受影響", () => {
    let data = createEmptyFinanceData();
    data = upsertSnapshot(data, snapshot("2026-07-12", 1000));
    data = upsertSnapshot(data, snapshot("2026-07-13", 2000));

    expect(data.snapshots).toHaveLength(2);
    expect(getSnapshotForDate(data, "2026-07-12")?.cashSources[0].amount).toBe(
      1000
    );
    expect(getSnapshotForDate(data, "2026-07-13")?.cashSources[0].amount).toBe(
      2000
    );
  });
});

describe("getLatestSnapshot", () => {
  // PRD 第 9 節 #13：今天尚無快照時，取得最近一筆資料供表單預帶
  it("回傳日期最大的快照，不受插入順序影響", () => {
    let data = createEmptyFinanceData();
    data = upsertSnapshot(data, snapshot("2026-07-13", 2000));
    data = upsertSnapshot(data, snapshot("2026-07-05", 500));
    data = upsertSnapshot(data, snapshot("2026-07-10", 1000));

    expect(getLatestSnapshot(data)?.date).toBe("2026-07-13");
  });

  it("沒有任何快照時回傳 undefined", () => {
    expect(getLatestSnapshot(createEmptyFinanceData())).toBeUndefined();
  });
});

describe("getSnapshotsInRange", () => {
  // PRD 第 4.2、5.4 節：趨勢圖範圍下拉選單（7/30/90 天），資料本身不刪除
  it("只取最近 N 天（含今天）的快照，但不影響底層資料", () => {
    const today = new Date();
    // 產生連續 15 天的快照：今天往前推 14 天 ~ 今天
    const dates = Array.from({ length: 15 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (14 - i));
      return getCurrentDate(d);
    });

    let data = createEmptyFinanceData();
    dates.forEach((date, i) => {
      data = upsertSnapshot(data, snapshot(date, i));
    });

    const recent = getSnapshotsInRange(data, 7);
    expect(recent).toHaveLength(7);
    expect(recent[0].date).toBe(dates[8]); // 最後 7 筆的起點
    expect(recent.at(-1)?.date).toBe(dates.at(-1));
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

  // PRD 第 6.1 節：schemaVersion 低於目前版本時，執行轉換邏輯後再載入（V1 一路遷移到目前版本 V4）
  it("V1 舊格式資料（無 usStockCurrency）會自動遷移為目前版本，補上預設值 USD", () => {
    const v1Raw = JSON.stringify({
      schemaVersion: 1,
      snapshots: [
        {
          month: "2026-01",
          updatedAt: "2026-01-01T00:00:00Z",
          cashSources: [{ id: "x", name: "現金", amount: 1000 }],
          twStockValue: 100000,
          usStockValue: 1000,
          exchangeRate: 32,
          loan: 0,
          otherDebt: 0,
          cashFlow: 0,
        },
      ],
    });

    const result = parseFinanceData(v1Raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.data.snapshots[0].usStockCurrency).toBe("USD");
      // 遷移後的計算結果應與遷移前的行為完全一致（美股原本就是以 USD 換算）
      expect(result.data.snapshots[0].usStockValue).toBe(1000);
      expect(result.data.snapshots[0].exchangeRate).toBe(32);
      // V1 → V4 一路遷移，loan/otherDebt 應轉為 debts 清單，month 應轉為 date
      expect(result.data.snapshots[0].debts).toHaveLength(2);
      expect(result.data.snapshots[0].incomeSources).toEqual([]);
      expect(result.data.snapshots[0].monthlyExpense).toBe(0);
      expect(result.data.snapshots[0].date).toBe("2026-01-01");
    }
  });

  // PRD 第 9 節 #16b：V2（loan/otherDebt 單一數字）遷移為 V3 類別化負債清單，再遷移為 V4
  it("V2 舊格式資料（loan/otherDebt/cashFlow）會自動遷移為目前版本", () => {
    const v2Raw = JSON.stringify({
      schemaVersion: 2,
      snapshots: [
        {
          month: "2026-06",
          updatedAt: "2026-06-01T00:00:00Z",
          cashSources: [{ id: "x", name: "現金", amount: 1000 }],
          twStockValue: 100000,
          usStockValue: 1000,
          usStockCurrency: "USD",
          exchangeRate: 32,
          loan: 300000,
          otherDebt: 15000,
          cashFlow: 28000,
        },
      ],
    });

    const result = parseFinanceData(v2Raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      const snapshot = result.data.snapshots[0];
      expect(snapshot.date).toBe("2026-06-01");
      expect(snapshot.debts).toHaveLength(2);
      const totalPrincipal = snapshot.debts.reduce(
        (sum, d) => sum + d.principal,
        0
      );
      expect(totalPrincipal).toBe(315000);
      const houseDebt = snapshot.debts.find((d) => d.category === "房貸");
      const otherDebtItem = snapshot.debts.find((d) => d.category === "其他");
      expect(houseDebt?.principal).toBe(300000);
      expect(otherDebtItem?.principal).toBe(15000);
      expect(houseDebt?.annualRate).toBe(0);
      expect(houseDebt?.remainingMonths).toBe(0);
      expect(snapshot.incomeSources).toEqual([]);
      // 舊 cashFlow 語意為淨現金流，與新欄位「支出」語意相反，不沿用
      expect(snapshot.monthlyExpense).toBe(0);
    }
  });

  // PRD 第 9 節 #16c：V3（快照顆粒度為月）遷移為 V4（顆粒度改為日）
  it("V3 舊格式資料（month）會自動遷移為 V4（date，取自 updatedAt 的日期部分）", () => {
    const v3Raw = JSON.stringify({
      schemaVersion: 3,
      snapshots: [
        {
          month: "2026-06",
          updatedAt: "2026-06-28T09:12:00Z",
          cashSources: [{ id: "x", name: "現金", amount: 1000 }],
          twStockValue: 0,
          usStockValue: 0,
          usStockCurrency: "USD",
          exchangeRate: 0,
          debts: [],
          incomeSources: [],
          monthlyExpense: 0,
        },
      ],
    });

    const result = parseFinanceData(v3Raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.schemaVersion).toBe(4);
      expect(result.data.snapshots).toHaveLength(1);
      expect(result.data.snapshots[0].date).toBe("2026-06-28");
      expect(result.data.snapshots[0]).not.toHaveProperty("month");
      expect(result.data.snapshots[0].cashSources[0].amount).toBe(1000);
    }
  });
});

describe("getCurrentDate", () => {
  it("格式化為 YYYY-MM-DD", () => {
    expect(getCurrentDate(new Date("2026-07-11T00:00:00"))).toBe("2026-07-11");
    expect(getCurrentDate(new Date("2026-01-05T00:00:00"))).toBe("2026-01-05");
  });
});

describe("createEmptyFinanceData", () => {
  it("使用目前的 schemaVersion", () => {
    expect(createEmptyFinanceData().schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describe("monthsBetweenDates", () => {
  it("以曆月差計算，忽略日期造成的天數誤差", () => {
    expect(monthsBetweenDates("2026-01-15", "2026-03-02")).toBe(2);
    expect(monthsBetweenDates("2026-01-31", "2026-02-01")).toBe(1);
  });

  it("跨年份時正確累加月數", () => {
    expect(monthsBetweenDates("2025-11-01", "2026-02-01")).toBe(3);
  });

  it("同一個月內不算經過任何一期", () => {
    expect(monthsBetweenDates("2026-06-01", "2026-06-28")).toBe(0);
  });

  it("結束日期早於起始日期時，不回傳負數", () => {
    expect(monthsBetweenDates("2026-06-01", "2026-05-01")).toBe(0);
  });
});

beforeEach(() => {
  localStorage.clear();
});
