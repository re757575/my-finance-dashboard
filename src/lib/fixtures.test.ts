import { describe, expect, it } from "vitest";
import rawFinanceData from "../../fixtures/finance-data.json?raw";
import { calculateMetrics, PLEDGE_MARGIN_CALL_RATIO } from "@/lib/calculations";
import { getLatestSnapshot, parseFinanceData } from "@/lib/storage";
import { CURRENT_SCHEMA_VERSION } from "@/types/schema";

// fixtures/finance-data.json 是全部虛構、填滿所有功能欄位的測試資料；
// 新增／調整功能或 schema 欄位時必須同步更新它（見 CLAUDE.md「測試」章節）。
function loadFixture() {
  const result = parseFinanceData(rawFinanceData);
  if (result.status !== "ok") {
    throw new Error(`fixture 無法解析：${result.status}`);
  }
  return result.data;
}

describe("fixtures/finance-data.json", () => {
  it("可被 parseFinanceData 解析為 ok，且 schemaVersion 為目前版本", () => {
    const data = loadFixture();

    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(JSON.parse(rawFinanceData).schemaVersion).toBe(
      CURRENT_SCHEMA_VERSION
    );
  });

  it("至少 60 筆快照，且日期不重複", () => {
    const { snapshots } = loadFixture();

    expect(snapshots.length).toBeGreaterThanOrEqual(60);
    expect(new Set(snapshots.map((snapshot) => snapshot.date)).size).toBe(
      snapshots.length
    );
  });

  it("最新一筆快照填滿所有功能欄位", () => {
    const latest = getLatestSnapshot(loadFixture());
    expect(latest).toBeDefined();
    if (!latest) return;

    expect(latest.cashSources.some((source) => source.restricted)).toBe(true);
    expect(latest.cashSources.some((source) => !source.restricted)).toBe(true);
    expect(latest.twStockValue).toBeGreaterThan(0);
    expect(latest.usStockValue).toBeGreaterThan(0);
    expect(latest.usStockCurrency).toBe("USD");
    expect(latest.exchangeRate).toBeGreaterThan(0);
    expect(latest.realEstateValue).toBeGreaterThan(0);
    expect(new Set(latest.debts.map((debt) => debt.category))).toEqual(
      new Set(["房貸", "信貸", "質押", "其他"])
    );
    expect(
      latest.debts.some((debt) => debt.repaymentMethod === "amortizing")
    ).toBe(true);
    expect(
      latest.debts.some((debt) => debt.repaymentMethod === "interestOnly")
    ).toBe(true);
    expect(latest.incomeSources.length).toBeGreaterThan(0);
    expect(latest.monthlyExpense).toBeGreaterThan(0);
    expect(latest.targetNetWorth).toBeGreaterThan(0);
    expect(latest.targetCashRatio).toBeGreaterThan(0);
  });

  it("最新一筆快照的所有健康指標都有值（不含 NaN／null）", () => {
    const latest = getLatestSnapshot(loadFixture());
    expect(latest).toBeDefined();
    if (!latest) return;

    const metrics = calculateMetrics(latest);

    for (const [key, value] of Object.entries(metrics)) {
      expect(value, key).not.toBeNull();
      if (typeof value === "number") {
        expect(Number.isFinite(value), key).toBe(true);
      }
    }
  });

  it("歷史快照中質押維持率從未低於追繳線，且總資產長期成長", () => {
    const snapshots = [...loadFixture().snapshots].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    for (const snapshot of snapshots) {
      const { pledgeMaintenanceRatio } = calculateMetrics(snapshot);
      if (pledgeMaintenanceRatio !== null) {
        expect(pledgeMaintenanceRatio, snapshot.date).toBeGreaterThan(
          PLEDGE_MARGIN_CALL_RATIO
        );
      }
    }

    const first = calculateMetrics(snapshots[0]).totalAssets;
    const last = calculateMetrics(snapshots[snapshots.length - 1]).totalAssets;
    expect(last).toBeGreaterThan(first);
  });
});
