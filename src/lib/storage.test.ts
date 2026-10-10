import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyFinanceData,
  getCurrentDate,
  getLatestSnapshot,
  getSnapshotBefore,
  getSnapshotForDate,
  getSnapshotsInRange,
  getSnapshotsYearToDate,
  clearDemoMode,
  clearLastBackupAt,
  DEMO_MODE_KEY,
  LAST_BACKUP_KEY,
  loadDemoMode,
  loadFinanceData,
  loadLastBackupAt,
  monthsBetweenDates,
  parseFinanceData,
  persistDemoMode,
  persistFinanceData,
  recordBackupNow,
  STORAGE_KEY,
  upsertSnapshot,
} from "@/lib/storage";
import { createEmptySnapshot, CURRENT_SCHEMA_VERSION } from "@/types/schema";

function snapshot(date: string, amount: number) {
  return {
    ...createEmptySnapshot(date),
    cashSources: [{ id: "1", name: "現金", amount, restricted: false }],
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
  // PRD 第 4.2、5.4 節：趨勢圖範圍下拉選單（7／30／90 天、1 年），資料本身不刪除
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

  // PRD 4.2「跨日自動換日」：範圍以傳入的「今天」為基準，換日後由呼叫端帶入新日期
  it("可指定基準日，範圍從該日往前推算", () => {
    let data = createEmptyFinanceData();
    ["2026-09-24", "2026-09-25", "2026-10-01"].forEach((date, i) => {
      data = upsertSnapshot(data, snapshot(date, i));
    });

    expect(
      getSnapshotsInRange(data, 7, "2026-10-01").map((s) => s.date)
    ).toEqual(["2026-09-25", "2026-10-01"]);
    expect(
      getSnapshotsInRange(data, 7, "2026-10-02").map((s) => s.date)
    ).toEqual(["2026-10-01"]);
  });

  // PRD 4.2「趨勢圖範圍選項」、第 9 節 #57b：「1 年」為最近 365 天（含今天）
  it("1 年（365 天）：納入 364 天前的快照，365 天前的不納入", () => {
    let data = createEmptyFinanceData();
    ["2025-10-03", "2025-10-04", "2026-10-03"].forEach((date, i) => {
      data = upsertSnapshot(data, snapshot(date, i));
    });

    expect(
      getSnapshotsInRange(data, 365, "2026-10-03").map((s) => s.date)
    ).toEqual(["2025-10-04", "2026-10-03"]);
    expect(data.snapshots).toHaveLength(3);
  });

  it("1 年固定為 365 天，跨過閏日時不多算一天", () => {
    let data = createEmptyFinanceData();
    // 2024 為閏年：2024-06-30 往前 364 天是 2023-07-02
    ["2023-07-01", "2023-07-02", "2024-06-30"].forEach((date, i) => {
      data = upsertSnapshot(data, snapshot(date, i));
    });

    expect(
      getSnapshotsInRange(data, 365, "2024-06-30").map((s) => s.date)
    ).toEqual(["2023-07-02", "2024-06-30"]);
  });
});

// PRD 4.2「趨勢圖範圍選項」、5.4 節、第 9 節 #57c、#57d
describe("getSnapshotsYearToDate", () => {
  it("只取今天所屬年份 1 月 1 日（含）之後的快照，前一年 12/31 不納入，且不影響底層資料", () => {
    let data = createEmptyFinanceData();
    // 刻意打亂寫入順序，確認回傳結果依日期遞增
    ["2026-09-30", "2025-12-31", "2026-01-01", "2025-06-15"].forEach(
      (date, i) => {
        data = upsertSnapshot(data, snapshot(date, i));
      }
    );

    expect(
      getSnapshotsYearToDate(data, "2026-10-03").map((s) => s.date)
    ).toEqual(["2026-01-01", "2026-09-30"]);
    expect(data.snapshots).toHaveLength(4);
  });

  it("今天就是 1 月 1 日：只納入當天（含）之後的快照", () => {
    let data = createEmptyFinanceData();
    ["2025-12-31", "2026-01-01"].forEach((date, i) => {
      data = upsertSnapshot(data, snapshot(date, i));
    });

    expect(
      getSnapshotsYearToDate(data, "2026-01-01").map((s) => s.date)
    ).toEqual(["2026-01-01"]);
  });

  it("今天是 12 月 31 日：納入整年度的快照", () => {
    let data = createEmptyFinanceData();
    ["2025-12-31", "2026-01-01", "2026-12-31"].forEach((date, i) => {
      data = upsertSnapshot(data, snapshot(date, i));
    });

    expect(
      getSnapshotsYearToDate(data, "2026-12-31").map((s) => s.date)
    ).toEqual(["2026-01-01", "2026-12-31"]);
  });

  it("跨年後改以新年度起算：新年度尚無快照時回傳空陣列", () => {
    let data = createEmptyFinanceData();
    ["2026-06-30", "2026-12-31"].forEach((date, i) => {
      data = upsertSnapshot(data, snapshot(date, i));
    });

    expect(getSnapshotsYearToDate(data, "2026-12-31")).toHaveLength(2);
    expect(getSnapshotsYearToDate(data, "2027-01-01")).toEqual([]);
  });

  it("未指定基準日時以實際的今天為準", () => {
    const today = getCurrentDate();
    const year = Number(today.slice(0, 4));
    let data = createEmptyFinanceData();
    [`${year - 1}-12-31`, `${year}-01-01`, today].forEach((date, i) => {
      data = upsertSnapshot(data, snapshot(date, i));
    });

    const dates = getSnapshotsYearToDate(data).map((s) => s.date);
    expect(dates).not.toContain(`${year - 1}-12-31`);
    expect(dates).toContain(`${year}-01-01`);
    expect(dates).toContain(today);
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
      expect(result.data.snapshots[0].targetNetWorth).toBe(0);
      expect(result.data.snapshots[0].targetCashRatio).toBe(0);
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
      expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.data.snapshots).toHaveLength(1);
      expect(result.data.snapshots[0].date).toBe("2026-06-28");
      expect(result.data.snapshots[0]).not.toHaveProperty("month");
      expect(result.data.snapshots[0].cashSources[0].amount).toBe(1000);
      // V3 → V4 → V5 → V6 一路遷移，也應補上 targetNetWorth／targetCashRatio
      expect(result.data.snapshots[0].targetNetWorth).toBe(0);
      expect(result.data.snapshots[0].targetCashRatio).toBe(0);
    }
  });

  // PRD 第 9 節 #31e：V4（無 targetNetWorth）遷移為 V5，補上 0（未設定），不臆測回填建議值
  it("V4 舊格式資料（無 targetNetWorth）會自動遷移為目前版本，補上 0", () => {
    const v4Raw = JSON.stringify({
      schemaVersion: 4,
      snapshots: [
        {
          date: "2026-06-28",
          updatedAt: "2026-06-28T09:12:00Z",
          cashSources: [{ id: "x", name: "現金", amount: 1000 }],
          twStockValue: 0,
          usStockValue: 0,
          usStockCurrency: "USD",
          exchangeRate: 0,
          debts: [],
          incomeSources: [],
          monthlyExpense: 30000,
        },
      ],
    });

    const result = parseFinanceData(v4Raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.data.snapshots[0].targetNetWorth).toBe(0);
      expect(result.data.snapshots[0].targetCashRatio).toBe(0);
      // 不依 monthlyExpense 臆測回填建議值，即使支出不為 0 也維持 0（未設定）
      expect(result.data.snapshots[0].monthlyExpense).toBe(30000);
    }
  });

  // 新增：V5（無 targetCashRatio）遷移為 V6，補上 0（未設定），不臆測回填目標配置
  it("V5 舊格式資料（無 targetCashRatio）會自動遷移為目前版本，補上 0", () => {
    const v5Raw = JSON.stringify({
      schemaVersion: 5,
      snapshots: [
        {
          date: "2026-06-28",
          updatedAt: "2026-06-28T09:12:00Z",
          cashSources: [{ id: "x", name: "現金", amount: 1000 }],
          twStockValue: 0,
          usStockValue: 0,
          usStockCurrency: "USD",
          exchangeRate: 0,
          debts: [],
          incomeSources: [],
          monthlyExpense: 30000,
          targetNetWorth: 5000000,
        },
      ],
    });

    const result = parseFinanceData(v5Raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.data.snapshots[0].targetCashRatio).toBe(0);
      // 既有欄位（targetNetWorth）不受影響
      expect(result.data.snapshots[0].targetNetWorth).toBe(5000000);
    }
  });

  // PRD 第 9 節 #43：V6（無不可動用標記／不動產市值／質押股票市值）遷移為 V7，補上預設值，不臆測回填
  it("V6 舊格式資料會自動遷移為目前版本，補上 realEstateValue／restricted／collateralValue 預設值", () => {
    const v6Raw = JSON.stringify({
      schemaVersion: 6,
      snapshots: [
        {
          date: "2026-06-28",
          updatedAt: "2026-06-28T09:12:00Z",
          cashSources: [
            { id: "x", name: "現金", amount: 1000 },
            { id: "y", name: "期貨保證金", amount: 5000 },
          ],
          twStockValue: 0,
          usStockValue: 0,
          usStockCurrency: "USD",
          exchangeRate: 0,
          debts: [
            {
              id: "d",
              name: "股票質押",
              category: "質押",
              principal: 500000,
              annualRate: 3.5,
              remainingMonths: 12,
              repaymentMethod: "interestOnly",
            },
          ],
          incomeSources: [],
          monthlyExpense: 30000,
          targetNetWorth: 5000000,
          targetCashRatio: 30,
        },
      ],
    });

    const result = parseFinanceData(v6Raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const snapshot = result.data.snapshots[0];
      expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(snapshot.realEstateValue).toBe(0);
      // 所有既有現金來源視為可動用，緊急預備金與現金比例算法與遷移前一致
      expect(snapshot.cashSources.map((c) => c.restricted)).toEqual([
        false,
        false,
      ]);
      expect(snapshot.debts[0].collateralValue).toBe(0);
      // 既有欄位不受影響
      expect(snapshot.debts[0].principal).toBe(500000);
      expect(snapshot.targetCashRatio).toBe(30);
    }
  });

  // PRD 第 9 節 #62h：V7（無每月定期定額清單）遷移為 V8，補上空清單，不臆測回填
  it("V7 舊格式資料會自動遷移為目前版本，補上空的 recurringInvestments", () => {
    const v7Raw = JSON.stringify({
      schemaVersion: 7,
      snapshots: [
        {
          date: "2026-09-30",
          updatedAt: "2026-09-30T09:12:00Z",
          cashSources: [
            { id: "x", name: "現金", amount: 1000, restricted: false },
          ],
          twStockValue: 0,
          usStockValue: 0,
          usStockCurrency: "USD",
          exchangeRate: 0,
          realEstateValue: 5000000,
          debts: [],
          incomeSources: [{ id: "i", name: "薪資", amount: 60000 }],
          monthlyExpense: 30000,
          targetNetWorth: 5000000,
          targetCashRatio: 30,
        },
      ],
    });

    const result = parseFinanceData(v7Raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const snapshot = result.data.snapshots[0];
      expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(snapshot.recurringInvestments).toEqual([]);
      // 既有欄位不受影響
      expect(snapshot.monthlyExpense).toBe(30000);
      expect(snapshot.incomeSources).toEqual([
        { id: "i", name: "薪資", amount: 60000 },
      ]);
      expect(snapshot.realEstateValue).toBe(5000000);
    }
  });

  it("目前版本的資料原樣保留定期定額清單，不經過遷移", () => {
    const snapshot = {
      ...createEmptySnapshot("2026-10-06"),
      recurringInvestments: [{ id: "r1", name: "0050", amount: 10000 }],
    };
    const raw = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      snapshots: [snapshot],
    });

    const result = parseFinanceData(raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.snapshots[0].recurringInvestments).toEqual([
        { id: "r1", name: "0050", amount: 10000 },
      ]);
    }
  });

  // PRD 第 9 節 #72i：V8（無快照備註）遷移為 V9，補上空字串，不臆測回填
  it("V8 舊格式資料會自動遷移為目前版本，補上空的 note", () => {
    const v8Raw = JSON.stringify({
      schemaVersion: 8,
      snapshots: [
        {
          date: "2026-09-30",
          updatedAt: "2026-09-30T09:12:00Z",
          cashSources: [
            { id: "x", name: "現金", amount: 1000, restricted: false },
          ],
          twStockValue: 0,
          usStockValue: 0,
          usStockCurrency: "USD",
          exchangeRate: 0,
          realEstateValue: 5000000,
          debts: [],
          incomeSources: [{ id: "i", name: "薪資", amount: 60000 }],
          monthlyExpense: 30000,
          recurringInvestments: [{ id: "r1", name: "0050", amount: 10000 }],
          targetNetWorth: 5000000,
          targetCashRatio: 30,
        },
      ],
    });

    const result = parseFinanceData(v8Raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const snapshot = result.data.snapshots[0];
      expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.data.schemaVersion).toBe(9);
      expect(snapshot.note).toBe("");
      // 既有欄位不受影響
      expect(snapshot.date).toBe("2026-09-30");
      expect(snapshot.updatedAt).toBe("2026-09-30T09:12:00Z");
      expect(snapshot.monthlyExpense).toBe(30000);
      expect(snapshot.realEstateValue).toBe(5000000);
      expect(snapshot.recurringInvestments).toEqual([
        { id: "r1", name: "0050", amount: 10000 },
      ]);
    }
  });

  it("目前版本的資料原樣保留快照備註，不經過遷移", () => {
    const raw = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      snapshots: [{ ...createEmptySnapshot("2026-10-06"), note: "買房" }],
    });

    const result = parseFinanceData(raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.snapshots[0].note).toBe("買房");
    }
  });

  it("V7 以前的資料一路遷移時也會補上空的 note", () => {
    const v7Raw = JSON.stringify({
      schemaVersion: 7,
      snapshots: [
        {
          date: "2026-09-30",
          updatedAt: "2026-09-30T09:12:00Z",
          cashSources: [],
          twStockValue: 0,
          usStockValue: 0,
          usStockCurrency: "USD",
          exchangeRate: 0,
          realEstateValue: 0,
          debts: [],
          incomeSources: [],
          monthlyExpense: 0,
          targetNetWorth: 0,
          targetCashRatio: 0,
        },
      ],
    });

    const result = parseFinanceData(v7Raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.data.snapshots[0].note).toBe("");
      expect(result.data.snapshots[0].recurringInvestments).toEqual([]);
    }
  });

  it("V1 一路遷移到目前版本時，也會補上 V7、V8、V9 的新欄位", () => {
    const v1Raw = JSON.stringify({
      schemaVersion: 1,
      snapshots: [
        {
          month: "2026-01",
          updatedAt: "2026-01-01T00:00:00Z",
          cashSources: [{ id: "x", name: "現金", amount: 1000 }],
          twStockValue: 0,
          usStockValue: 0,
          exchangeRate: 0,
          loan: 100,
          otherDebt: 0,
          cashFlow: 0,
        },
      ],
    });

    const result = parseFinanceData(v1Raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const snapshot = result.data.snapshots[0];
      expect(snapshot.realEstateValue).toBe(0);
      expect(snapshot.cashSources[0].restricted).toBe(false);
      expect(snapshot.debts.every((d) => d.collateralValue === 0)).toBe(true);
      expect(snapshot.recurringInvestments).toEqual([]);
      expect(snapshot.note).toBe("");
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

// PRD 6.2 節：上次備份時間存在獨立的 LocalStorage 鍵，不屬於快照 schema
describe("上次備份時間", () => {
  it("使用獨立的鍵 my_finance_dashboard_last_backup，不同於快照資料的鍵", () => {
    expect(LAST_BACKUP_KEY).toBe("my_finance_dashboard_last_backup");
  });

  it("從未記錄過時回傳 null", () => {
    expect(loadLastBackupAt()).toBeNull();
  });

  it("recordBackupNow 寫入並回傳 ISO 字串，loadLastBackupAt 可讀回", () => {
    const now = new Date("2026-09-30T08:30:00.000Z");

    const iso = recordBackupNow(now);

    expect(iso).toBe("2026-09-30T08:30:00.000Z");
    expect(localStorage.getItem(LAST_BACKUP_KEY)).toBe(iso);
    expect(loadLastBackupAt()).toBe(iso);
  });

  it("後一次記錄會覆蓋前一次", () => {
    recordBackupNow(new Date("2026-09-01T00:00:00.000Z"));
    recordBackupNow(new Date("2026-09-30T00:00:00.000Z"));

    expect(loadLastBackupAt()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("內容不是合法日期時，視為從未備份（回傳 null），不拋錯", () => {
    localStorage.setItem(LAST_BACKUP_KEY, "not a date");
    expect(loadLastBackupAt()).toBeNull();

    localStorage.setItem(LAST_BACKUP_KEY, "");
    expect(loadLastBackupAt()).toBeNull();
  });

  it("clearLastBackupAt 移除紀錄", () => {
    recordBackupNow();
    clearLastBackupAt();

    expect(localStorage.getItem(LAST_BACKUP_KEY)).toBeNull();
    expect(loadLastBackupAt()).toBeNull();
  });

  it("不影響快照資料所在的鍵", () => {
    localStorage.setItem("my_finance_dashboard_data", "{}");
    recordBackupNow();
    clearLastBackupAt();

    expect(localStorage.getItem("my_finance_dashboard_data")).toBe("{}");
  });
});

// PRD 6.2 節：範例模式標記存在獨立的 LocalStorage 鍵，不屬於快照 schema
describe("範例模式標記", () => {
  it("使用獨立的鍵 my_finance_dashboard_demo，不同於快照資料與上次備份時間的鍵", () => {
    expect(DEMO_MODE_KEY).toBe("my_finance_dashboard_demo");
    expect(DEMO_MODE_KEY).not.toBe(STORAGE_KEY);
    expect(DEMO_MODE_KEY).not.toBe(LAST_BACKUP_KEY);
  });

  it("從未寫入時不是範例模式", () => {
    expect(loadDemoMode()).toBe(false);
  });

  it('persistDemoMode 寫入 "1" 並回傳 true，loadDemoMode 可讀回', () => {
    expect(persistDemoMode()).toBe(true);

    expect(localStorage.getItem(DEMO_MODE_KEY)).toBe("1");
    expect(loadDemoMode()).toBe(true);
  });

  it('內容不是 "1" 時一律視為不是範例模式，不拋錯', () => {
    for (const value of ["", "0", "true", "yes", "{}"]) {
      localStorage.setItem(DEMO_MODE_KEY, value);
      expect(loadDemoMode(), value).toBe(false);
    }
  });

  it("clearDemoMode 移除標記", () => {
    persistDemoMode();
    clearDemoMode();

    expect(localStorage.getItem(DEMO_MODE_KEY)).toBeNull();
    expect(loadDemoMode()).toBe(false);
  });

  it("沒有標記時呼叫 clearDemoMode 不拋錯", () => {
    expect(() => clearDemoMode()).not.toThrow();
  });

  it("不影響快照資料與上次備份時間所在的鍵", () => {
    localStorage.setItem(STORAGE_KEY, "{}");
    recordBackupNow(new Date("2026-09-30T08:30:00.000Z"));

    persistDemoMode();
    clearDemoMode();

    expect(localStorage.getItem(STORAGE_KEY)).toBe("{}");
    expect(loadLastBackupAt()).toBe("2026-09-30T08:30:00.000Z");
  });
});

// PRD 4.2「寫入失敗防護」、6.1 節「讀寫失敗」、第 9 節 #51a～#51d
describe("LocalStorage 讀寫失敗", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function failWrites() {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
  }

  function failReads() {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("access denied", "SecurityError");
    });
  }

  it("persistFinanceData 寫入成功回傳 true，資料可讀回", () => {
    const data = upsertSnapshot(
      createEmptyFinanceData(),
      snapshot("2026-10-02", 1000)
    );

    expect(persistFinanceData(data)).toBe(true);
    expect(loadFinanceData()).toEqual({ status: "ok", data });
  });

  it("persistFinanceData 寫入失敗回傳 false，不拋出例外", () => {
    failWrites();

    expect(persistFinanceData(createEmptyFinanceData())).toBe(false);
  });

  it("persistFinanceData 寫入失敗不會改動既有資料", () => {
    const existing = upsertSnapshot(
      createEmptyFinanceData(),
      snapshot("2026-10-01", 1000)
    );
    persistFinanceData(existing);
    failWrites();

    persistFinanceData(upsertSnapshot(existing, snapshot("2026-10-02", 2000)));

    vi.restoreAllMocks();
    expect(loadFinanceData()).toEqual({ status: "ok", data: existing });
  });

  it("loadFinanceData 在瀏覽器拒絕存取時視為無資料，不拋出例外", () => {
    localStorage.setItem(STORAGE_KEY, "{}");
    failReads();

    expect(loadFinanceData()).toEqual({ status: "empty" });
  });

  it("loadLastBackupAt 在瀏覽器拒絕存取時視為從未備份", () => {
    recordBackupNow();
    failReads();

    expect(loadLastBackupAt()).toBeNull();
  });

  it("recordBackupNow 寫入失敗仍回傳 ISO 字串，不拋出例外", () => {
    failWrites();

    expect(recordBackupNow(new Date("2026-10-02T08:30:00.000Z"))).toBe(
      "2026-10-02T08:30:00.000Z"
    );
  });

  it("loadDemoMode 在瀏覽器拒絕存取時視為不是範例模式", () => {
    persistDemoMode();
    failReads();

    expect(loadDemoMode()).toBe(false);
  });

  // 第 9 節 #63k
  it("persistDemoMode 寫入失敗回傳 false，不拋出例外，也不留下標記", () => {
    failWrites();

    expect(persistDemoMode()).toBe(false);

    vi.restoreAllMocks();
    expect(loadDemoMode()).toBe(false);
  });

  it("clearDemoMode 移除失敗不拋出例外", () => {
    persistDemoMode();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("access denied", "SecurityError");
    });

    expect(() => clearDemoMode()).not.toThrow();
  });
});

beforeEach(() => {
  localStorage.clear();
});

// PRD 4.2「總覽卡增減比對」第 1 點、第 9 節 #69b～#69d：比對基準
describe("getSnapshotBefore", () => {
  const snapshots = [
    snapshot("2026-07-13", 3000),
    snapshot("2026-07-05", 1000),
    snapshot("2026-07-10", 2000),
  ];

  it("回傳日期早於指定日期的最近一筆，不受陣列順序影響", () => {
    expect(getSnapshotBefore(snapshots, "2026-07-20")?.date).toBe("2026-07-13");
    expect(getSnapshotBefore(snapshots, "2026-07-12")?.date).toBe("2026-07-10");
  });

  it("不包含指定日期當天的快照（今天已存檔時不與自己比較）", () => {
    expect(getSnapshotBefore(snapshots, "2026-07-13")?.date).toBe("2026-07-10");
  });

  it("沒有更早的快照時回傳 undefined", () => {
    expect(getSnapshotBefore(snapshots, "2026-07-05")).toBeUndefined();
    expect(getSnapshotBefore([], "2026-07-05")).toBeUndefined();
  });
});
