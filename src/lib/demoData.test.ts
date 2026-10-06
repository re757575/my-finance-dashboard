import { afterEach, describe, expect, it, vi } from "vitest";
import rawFinanceData from "../../fixtures/finance-data.json?raw";

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return { ...actual, parseFinanceData: vi.fn(actual.parseFinanceData) };
});

import { daysBetweenDates } from "@/lib/dataFreshness";
import { loadDemoFinanceData, shiftSnapshotsToDate } from "@/lib/demoData";
import { parseFinanceData } from "@/lib/storage";
import {
  createEmptySnapshot,
  CURRENT_SCHEMA_VERSION,
  type FinanceData,
  type Snapshot,
} from "@/types/schema";

function snapshot(date: string, amount: number): Snapshot {
  return {
    ...createEmptySnapshot(date),
    updatedAt: `${date}T12:00:00.000Z`,
    cashSources: [{ id: "c1", name: "現金", amount, restricted: false }],
  };
}

function financeData(...snapshots: Snapshot[]): FinanceData {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, snapshots };
}

function dates(data: FinanceData): string[] {
  return data.snapshots.map((s) => s.date);
}

/** 去掉會被平移的日期欄位，只留下數值內容。 */
function withoutDates(snapshots: Snapshot[]) {
  return snapshots.map(({ date: _date, updatedAt: _updatedAt, ...rest }) => ({
    ...rest,
  }));
}

afterEach(() => {
  vi.mocked(parseFinanceData).mockClear();
});

// PRD 4.2「範例資料」第 3 點、第 9 節 #63c
describe("shiftSnapshotsToDate", () => {
  it("所有快照往後平移相同天數，最新一筆落在今天", () => {
    const data = financeData(
      snapshot("2026-07-31", 1),
      snapshot("2026-08-31", 2),
      snapshot("2026-09-30", 3)
    );

    const shifted = shiftSnapshotsToDate(data, "2026-10-06");

    expect(dates(shifted)).toEqual(["2026-08-06", "2026-09-06", "2026-10-06"]);
  });

  it("各筆之間的間隔天數不變", () => {
    const data = financeData(
      snapshot("2026-06-30", 1),
      snapshot("2026-07-31", 2),
      snapshot("2026-08-31", 3),
      snapshot("2026-09-30", 4)
    );
    const gaps = (list: string[]) =>
      list.slice(1).map((date, i) => daysBetweenDates(list[i], date));

    const shifted = shiftSnapshotsToDate(data, "2026-10-06");

    expect(gaps(dates(shifted))).toEqual(gaps(dates(data)));
    expect(gaps(dates(shifted))).toEqual([31, 31, 30]);
  });

  it("筆數與所有數值不變，只改日期與 updatedAt", () => {
    const data = financeData(
      snapshot("2026-08-31", 111),
      snapshot("2026-09-30", 222)
    );

    const shifted = shiftSnapshotsToDate(data, "2026-10-06");

    expect(shifted.schemaVersion).toBe(data.schemaVersion);
    expect(shifted.snapshots).toHaveLength(2);
    expect(withoutDates(shifted.snapshots)).toEqual(
      withoutDates(data.snapshots)
    );
  });

  it("updatedAt 同步平移相同天數，時刻不變", () => {
    const data = financeData(
      snapshot("2026-08-31", 1),
      snapshot("2026-09-30", 2)
    );

    const shifted = shiftSnapshotsToDate(data, "2026-10-06");

    expect(shifted.snapshots.map((s) => s.updatedAt)).toEqual([
      "2026-09-06T12:00:00.000Z",
      "2026-10-06T12:00:00.000Z",
    ]);
  });

  it("以日期最大的一筆為準，與陣列順序無關", () => {
    const data = financeData(
      snapshot("2026-09-30", 3),
      snapshot("2026-07-31", 1),
      snapshot("2026-08-31", 2)
    );

    const shifted = shiftSnapshotsToDate(data, "2026-10-06");

    expect(dates(shifted)).toEqual(["2026-10-06", "2026-08-06", "2026-09-06"]);
  });

  it("跨年、跨閏年 2 月 29 日仍正確", () => {
    const data = financeData(
      snapshot("2027-12-31", 1),
      snapshot("2028-01-31", 2)
    );

    const shifted = shiftSnapshotsToDate(data, "2028-02-29");

    expect(dates(shifted)).toEqual(["2028-01-29", "2028-02-29"]);
  });

  it("跨夏令時間切換日也不會差一天", () => {
    const data = financeData(
      snapshot("2026-03-07", 1),
      snapshot("2026-03-08", 2)
    );

    const shifted = shiftSnapshotsToDate(data, "2026-11-02");

    expect(dates(shifted)).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("最新一筆比今天晚時往前平移", () => {
    const data = financeData(
      snapshot("2026-08-31", 1),
      snapshot("2026-09-30", 2)
    );

    const shifted = shiftSnapshotsToDate(data, "2026-09-20");

    expect(dates(shifted)).toEqual(["2026-08-21", "2026-09-20"]);
  });

  it("最新一筆已經是今天時原樣回傳", () => {
    const data = financeData(
      snapshot("2026-09-06", 1),
      snapshot("2026-10-06", 2)
    );

    expect(shiftSnapshotsToDate(data, "2026-10-06")).toBe(data);
  });

  it("沒有快照時原樣回傳", () => {
    const data = financeData();

    expect(shiftSnapshotsToDate(data, "2026-10-06")).toBe(data);
  });

  it("不改動傳入的資料", () => {
    const data = financeData(
      snapshot("2026-08-31", 1),
      snapshot("2026-09-30", 2)
    );
    const before = JSON.stringify(data);

    shiftSnapshotsToDate(data, "2026-10-06");

    expect(JSON.stringify(data)).toBe(before);
  });
});

// PRD 4.2「範例資料」第 2、3 點
describe("loadDemoFinanceData", () => {
  function fixture(): FinanceData {
    return JSON.parse(rawFinanceData) as FinanceData;
  }

  it("載入 fixtures/finance-data.json，schemaVersion 為目前版本", async () => {
    const data = await loadDemoFinanceData("2026-10-06");

    expect(data).not.toBeNull();
    expect(data?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(data?.snapshots).toHaveLength(fixture().snapshots.length);
  });

  it("走與匯入還原相同的 parseFinanceData 驗證", async () => {
    await loadDemoFinanceData("2026-10-06");

    expect(parseFinanceData).toHaveBeenCalledWith(rawFinanceData);
  });

  it("最新一筆落在今天，日期不重複", async () => {
    const data = await loadDemoFinanceData("2027-03-15");
    const list = dates(data!).sort();

    expect(list.at(-1)).toBe("2027-03-15");
    expect(new Set(list).size).toBe(list.length);
    expect(list.every((date) => date <= "2027-03-15")).toBe(true);
  });

  // 第 9 節 #63c
  it("fixture 最新兩筆（2026-08-31、2026-09-30）於 2026-10-06 載入：往後 6 天", async () => {
    expect(dates(fixture()).sort().slice(-2)).toEqual([
      "2026-08-31",
      "2026-09-30",
    ]);

    const data = await loadDemoFinanceData("2026-10-06");

    expect(dates(data!).sort().slice(-2)).toEqual(["2026-09-06", "2026-10-06"]);
  });

  it("除了日期與 updatedAt，內容與 fixture 完全相同", async () => {
    const data = await loadDemoFinanceData("2026-10-06");

    expect(withoutDates(data!.snapshots)).toEqual(
      withoutDates(fixture().snapshots)
    );
  });

  it("範例檔驗證不通過時回傳 null", async () => {
    vi.mocked(parseFinanceData).mockReturnValueOnce({ status: "corrupted" });
    expect(await loadDemoFinanceData("2026-10-06")).toBeNull();

    vi.mocked(parseFinanceData).mockReturnValueOnce({
      status: "version-mismatch",
      foundVersion: 999,
    });
    expect(await loadDemoFinanceData("2026-10-06")).toBeNull();
  });

  it("載入過程拋出例外時回傳 null，不往外拋", async () => {
    vi.mocked(parseFinanceData).mockImplementationOnce(() => {
      throw new Error("chunk load failed");
    });

    await expect(loadDemoFinanceData("2026-10-06")).resolves.toBeNull();
  });
});
