import { describe, expect, it } from "vitest";
import rawFinanceData from "../../fixtures/finance-data.json?raw";
import {
  calculateGoalEstimates,
  calculateMetrics,
  PLEDGE_MARGIN_CALL_RATIO,
} from "@/lib/calculations";
import { normalizeSnapshotNote } from "@/lib/snapshotNote";
import { getLatestSnapshot, parseFinanceData } from "@/lib/storage";
import { CURRENT_SCHEMA_VERSION } from "@/types/schema";

// fixtures/finance-data.json 是全部虛構、填滿所有功能欄位的測試資料；
// 新增／調整功能或 schema 欄位時必須同步更新它（見 docs/architecture/testing.md）。
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
    expect(latest.recurringInvestments.length).toBeGreaterThan(0);
    expect(
      latest.recurringInvestments.every((investment) => investment.amount > 0)
    ).toBe(true);
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

  // PRD 5.8、5.10 節：快照比較的「質押」組需要這三種狀態才測得完整
  it("質押資料涵蓋尚未填寫、單筆與多筆三種狀態，且本金合計始終不變", () => {
    const snapshots = [...loadFixture().snapshots].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const states = snapshots.map((snapshot) => {
      const pledges = snapshot.debts.filter((debt) => debt.category === "質押");
      const metrics = calculateMetrics(snapshot);
      return {
        date: snapshot.date,
        count: pledges.length,
        principal: metrics.pledgePrincipal,
        status: metrics.pledgeMaintenanceStatus,
      };
    });

    // 本金沒有還本：負債組恆為「持平」，變化只看得到質押股票市值與維持率
    expect(new Set(states.map((state) => state.principal))).toEqual(
      new Set([1200000])
    );
    // 最早幾筆尚未填寫質押股票市值（比照舊版資料遷移後的狀態），之後每筆都有
    const unset = states.filter((state) => state.status === "unset");
    expect(unset.map((state) => state.date)).toEqual([
      "2021-10-31",
      "2021-11-30",
      "2021-12-31",
    ]);
    expect(states.some((state) => state.status === "none")).toBe(false);
    // 2024-01 起由一筆拆成兩筆，最新一筆為多筆質押
    expect(states.filter((state) => state.count === 1)).toHaveLength(27);
    expect(states.filter((state) => state.count === 2)).toHaveLength(33);
    expect(states.find((state) => state.count === 2)?.date).toBe("2024-01-31");
    expect(states.at(-1)?.count).toBe(2);
  });

  it("每筆質押負債各自的維持率也從未低於追繳線", () => {
    for (const snapshot of loadFixture().snapshots) {
      for (const debt of snapshot.debts) {
        if (debt.category !== "質押" || debt.collateralValue === 0) continue;
        expect(
          (debt.collateralValue / debt.principal) * 100,
          `${snapshot.date} ${debt.name}`
        ).toBeGreaterThanOrEqual(PLEDGE_MARGIN_CALL_RATIO);
      }
    }
  });

  // PRD 5.7a 節：fixture 有目標淨資產、收支、攤還中的負債與跨一年以上的歷史，兩種估算都可算
  it("目標達成時間預估：依目前收支與依歷史變化皆可估算", () => {
    const data = loadFixture();
    const latest = getLatestSnapshot(data)!;

    const estimates = calculateGoalEstimates(latest, data.snapshots);

    expect(estimates.baseDate).toBe("2026-09-30");
    expect(estimates.budget.status).toBe("ok");
    expect(estimates.budget.principalRepayment).toBeGreaterThan(0);
    expect(estimates.budget.monthlyPace).toBeCloseTo(
      estimates.budget.cashFlow + estimates.budget.principalRepayment
    );
    expect(estimates.history).toMatchObject({
      status: "ok",
      fromDate: "2025-09-30",
      toDate: "2026-09-30",
    });
    expect(estimates.history.months).toBeGreaterThan(0);
  });

  // PRD 4.2「快照備註」：範例資料有幾筆示範用的備註，供趨勢圖節點標記與歷史快照清單展示
  it("每筆快照都有 note 欄位，其中幾筆有備註且已是正規化後的內容", () => {
    const { snapshots } = loadFixture();

    expect(
      snapshots.every((snapshot) => typeof snapshot.note === "string")
    ).toBe(true);
    const noted = snapshots.filter((snapshot) => snapshot.note !== "");
    expect(noted.map((snapshot) => [snapshot.date, snapshot.note])).toEqual([
      ["2022-10-31", "新一期信用卡分期"],
      ["2023-01-31", "多一筆定期定額"],
      ["2023-10-31", "調薪"],
      ["2024-01-31", "質押拆成券商與銀行兩筆"],
      ["2025-10-31", "換工作"],
      ["2026-04-30", "副業收入增加"],
    ]);
    for (const snapshot of noted) {
      expect(normalizeSnapshotNote(snapshot.note), snapshot.date).toBe(
        snapshot.note
      );
    }
  });

  it("載入範例資料後預設的 1 年範圍內至少有一筆備註", () => {
    const { snapshots } = loadFixture();
    const latest = getLatestSnapshot(loadFixture())!;
    const cutoff = new Date(`${latest.date}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - 364);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const inRange = snapshots.filter(
      (snapshot) => snapshot.date >= cutoffDate && snapshot.note !== ""
    );
    expect(inRange.length).toBeGreaterThanOrEqual(1);
    // 最新一筆沒有備註：載入範例資料後，今日表單的備註欄是空的
    expect(latest.note).toBe("");
  });
});
