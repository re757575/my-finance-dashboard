import { describe, expect, it } from "vitest";
import rawFinanceData from "../../fixtures/finance-data.json?raw";
import { compareSnapshots, type ComparisonRow } from "@/lib/snapshotComparison";
import { parseFinanceData } from "@/lib/storage";
import {
  createEmptySnapshot,
  type CashSource,
  type Debt,
  type DebtCategory,
  type Snapshot,
} from "@/types/schema";

function cash(id: string, name: string, amount: number): CashSource {
  return { id, name, amount, restricted: false };
}

function debt(
  id: string,
  name: string,
  principal: number,
  category: DebtCategory = "信貸"
): Debt {
  return {
    id,
    name,
    category,
    principal,
    annualRate: 0,
    remainingMonths: 12,
    repaymentMethod: "amortizing",
    collateralValue: 0,
  };
}

function snap(date: string, patch: Partial<Snapshot> = {}): Snapshot {
  return { ...createEmptySnapshot(date), ...patch };
}

function rowByKey(rows: ComparisonRow[], key: string): ComparisonRow {
  const row = rows.find((r) => r.key === key);
  if (!row) throw new Error(`找不到列 ${key}`);
  return row;
}

// PRD 4.2「快照比較」、5.10 節、第 9 節 #55c～#55l
describe("compareSnapshots", () => {
  const base = snap("2026-08-31", {
    cashSources: [cash("c1", "銀行", 100000)],
    twStockValue: 200000,
    debts: [debt("d1", "信貸", 50000)],
  });
  const target = snap("2026-09-30", {
    cashSources: [cash("c1", "銀行", 150000)],
    twStockValue: 180000,
    debts: [debt("d1", "信貸", 40000)],
  });

  it("回傳兩筆快照的日期", () => {
    const result = compareSnapshots(base, target);

    expect(result.baseDate).toBe("2026-08-31");
    expect(result.targetDate).toBe("2026-09-30");
  });

  // #55c
  it("總覽：淨資產、總資產、總負債的增減與百分比（對象日 − 基準日）", () => {
    const { summary } = compareSnapshots(base, target);

    expect(summary.map((r) => r.key)).toEqual([
      "net-worth",
      "total-assets",
      "total-liabilities",
    ]);
    expect(rowByKey(summary, "net-worth")).toMatchObject({
      label: "淨資產",
      base: 250000,
      target: 290000,
      delta: 40000,
      percent: 16,
    });
    expect(rowByKey(summary, "total-assets")).toMatchObject({
      base: 300000,
      target: 330000,
      delta: 30000,
      percent: 10,
    });
    expect(rowByKey(summary, "total-liabilities")).toMatchObject({
      base: 50000,
      target: 40000,
      delta: -10000,
      percent: -20,
    });
  });

  // #55c
  it("資產：現金合計與台股市值的增減與百分比", () => {
    const { assets } = compareSnapshots(base, target);

    expect(rowByKey(assets, "cash")).toMatchObject({
      label: "現金合計",
      base: 100000,
      target: 150000,
      delta: 50000,
      percent: 50,
    });
    expect(rowByKey(assets, "tw-stock")).toMatchObject({
      base: 200000,
      target: 180000,
      delta: -20000,
      percent: -10,
    });
  });

  // #55d
  it("負債比的增減是百分點，不換算相對百分比", () => {
    const result = compareSnapshots(
      snap("2026-08-31", {
        cashSources: [cash("c1", "銀行", 200000)],
        debts: [debt("d1", "信貸", 50000)],
      }),
      snap("2026-09-30", {
        cashSources: [cash("c1", "銀行", 200000)],
        debts: [debt("d1", "信貸", 40000)],
      })
    );

    expect(result.debtRatio).toMatchObject({
      key: "debt-ratio",
      label: "負債比",
      base: 25,
      target: 20,
      delta: -5,
      percent: null,
    });
  });

  it("反向比較時，增減正負相反", () => {
    const forward = compareSnapshots(base, target);
    const backward = compareSnapshots(target, base);

    expect(backward.baseDate).toBe("2026-09-30");
    expect(rowByKey(backward.summary, "net-worth").delta).toBe(
      -rowByKey(forward.summary, "net-worth").delta
    );
    expect(rowByKey(backward.assets, "cash").delta).toBe(-50000);
  });

  describe("百分比", () => {
    // #55f
    it("數值相同時增減為 0", () => {
      const result = compareSnapshots(base, { ...base, date: "2026-09-30" });

      expect(rowByKey(result.assets, "cash")).toMatchObject({
        delta: 0,
        percent: 0,
      });
    });

    // #55f
    it("基準值為 0 時不具比較意義，百分比為 null", () => {
      const result = compareSnapshots(
        snap("2026-08-31"),
        snap("2026-09-30", { twStockValue: 5000 })
      );

      expect(rowByKey(result.assets, "tw-stock")).toMatchObject({
        base: 0,
        target: 5000,
        delta: 5000,
        percent: null,
      });
    });

    it("基準值為負數（淨資產為負）時百分比為 null", () => {
      const result = compareSnapshots(
        snap("2026-08-31", { debts: [debt("d1", "信貸", 10000)] }),
        snap("2026-09-30", { debts: [debt("d1", "信貸", 4000)] })
      );

      expect(rowByKey(result.summary, "net-worth")).toMatchObject({
        base: -10000,
        target: -4000,
        delta: 6000,
        percent: null,
      });
    });
  });

  describe("美股與不動產", () => {
    // #55g
    it("美金計價時以各自快照的匯率換算成台幣比較，增減包含匯率變動", () => {
      const result = compareSnapshots(
        snap("2026-08-31", {
          usStockValue: 1000,
          usStockCurrency: "USD",
          exchangeRate: 30,
        }),
        snap("2026-09-30", {
          usStockValue: 1000,
          usStockCurrency: "USD",
          exchangeRate: 32,
        })
      );

      expect(rowByKey(result.assets, "us-stock")).toMatchObject({
        label: "美股市值（台幣）",
        base: 30000,
        target: 32000,
        delta: 2000,
      });
    });

    it("台幣計價時不乘上匯率", () => {
      const result = compareSnapshots(
        snap("2026-08-31", {
          usStockValue: 30000,
          usStockCurrency: "TWD",
          exchangeRate: 30,
        }),
        snap("2026-09-30", {
          usStockValue: 32000,
          usStockCurrency: "TWD",
          exchangeRate: 32,
        })
      );

      expect(rowByKey(result.assets, "us-stock")).toMatchObject({
        base: 30000,
        target: 32000,
      });
    });

    // #55l
    it("不動產在兩筆皆為 0 時不列出", () => {
      const { assets } = compareSnapshots(base, target);

      expect(assets.map((r) => r.key)).toEqual([
        "cash",
        "tw-stock",
        "us-stock",
      ]);
    });

    it("任一筆有不動產市值時列出，並計入總資產", () => {
      const result = compareSnapshots(
        snap("2026-08-31"),
        snap("2026-09-30", { realEstateValue: 8000000 })
      );

      expect(rowByKey(result.assets, "real-estate")).toMatchObject({
        label: "不動產市值",
        base: 0,
        target: 8000000,
        delta: 8000000,
        percent: null,
      });
      expect(rowByKey(result.summary, "total-assets").delta).toBe(8000000);
    });
  });

  describe("逐筆現金來源與負債", () => {
    it("以 id 對應；名稱以對象日為準", () => {
      const result = compareSnapshots(
        snap("2026-08-31", { cashSources: [cash("c1", "舊名稱", 1000)] }),
        snap("2026-09-30", { cashSources: [cash("c1", "新名稱", 1500)] })
      );

      expect(result.cashSources).toEqual([
        {
          key: "cash-source-c1",
          label: "新名稱",
          base: 1000,
          target: 1500,
          delta: 500,
          percent: 50,
        },
      ]);
    });

    // #55e
    it("只存在於對象日的項目：基準值為 null，增減為其金額，不計百分比", () => {
      const result = compareSnapshots(
        snap("2026-08-31", { cashSources: [cash("c1", "銀行", 1000)] }),
        snap("2026-09-30", {
          cashSources: [cash("c1", "銀行", 1000), cash("c2", "新帳戶", 700)],
        })
      );

      expect(rowByKey(result.cashSources, "cash-source-c2")).toEqual({
        key: "cash-source-c2",
        label: "新帳戶",
        base: null,
        target: 700,
        delta: 700,
        percent: null,
      });
    });

    // #55e
    it("只存在於基準日的項目：對象值為 null，增減為負的本金，名稱用基準日的", () => {
      const result = compareSnapshots(
        snap("2026-08-31", {
          debts: [debt("d1", "信貸", 50000), debt("d2", "車貸", 30000, "其他")],
        }),
        snap("2026-09-30", { debts: [debt("d1", "信貸", 40000)] })
      );

      expect(rowByKey(result.debts, "debt-d2")).toEqual({
        key: "debt-d2",
        label: "車貸（其他）",
        base: 30000,
        target: null,
        delta: -30000,
        percent: -100,
      });
    });

    it("依對象日的順序排列，已移除的項目排在最後", () => {
      const result = compareSnapshots(
        snap("2026-08-31", {
          cashSources: [
            cash("removed", "已關閉", 1),
            cash("a", "甲", 1),
            cash("b", "乙", 1),
          ],
        }),
        snap("2026-09-30", {
          cashSources: [
            cash("b", "乙", 1),
            cash("new", "新", 1),
            cash("a", "甲", 1),
          ],
        })
      );

      expect(result.cashSources.map((r) => r.key)).toEqual([
        "cash-source-b",
        "cash-source-new",
        "cash-source-a",
        "cash-source-removed",
      ]);
    });

    it("負債標示類別；未填名稱時顯示「未命名」", () => {
      const result = compareSnapshots(
        snap("2026-08-31"),
        snap("2026-09-30", {
          cashSources: [cash("c1", "", 100)],
          debts: [debt("d1", "", 100, "房貸"), debt("d2", "車貸", 100, "其他")],
        })
      );

      expect(result.cashSources[0].label).toBe("未命名");
      expect(result.debts.map((r) => r.label)).toEqual([
        "未命名（房貸）",
        "車貸（其他）",
      ]);
    });

    // #55l
    it("兩筆皆無現金來源與負債時回傳空陣列", () => {
      const result = compareSnapshots(snap("2026-08-31"), snap("2026-09-30"));

      expect(result.cashSources).toEqual([]);
      expect(result.debts).toEqual([]);
    });

    it("非數字的金額視為 0（輸入防呆）", () => {
      const result = compareSnapshots(
        snap("2026-08-31", {
          cashSources: [cash("c1", "銀行", Number.NaN)],
        }),
        snap("2026-09-30", { cashSources: [cash("c1", "銀行", 500)] })
      );

      expect(result.cashSources[0]).toMatchObject({
        base: 0,
        target: 500,
        delta: 500,
        percent: null,
      });
    });
  });

  it("不改動傳入的快照", () => {
    const baseCopy = structuredClone(base);
    const targetCopy = structuredClone(target);

    compareSnapshots(base, target);

    expect(base).toEqual(baseCopy);
    expect(target).toEqual(targetCopy);
  });

  // 以全功能 fixture 驗證：逐筆增減的合計與總額的增減一致（PRD 5.10 節）
  describe("fixtures/finance-data.json", () => {
    function loadSnapshots() {
      const result = parseFinanceData(rawFinanceData);
      if (result.status !== "ok") {
        throw new Error(`fixture 無法解析：${result.status}`);
      }
      return result.data.snapshots;
    }

    const sum = (rows: { delta: number }[]) =>
      rows.reduce((total, row) => total + row.delta, 0);

    it("現金來源逐筆增減合計等於現金合計的增減；負債逐筆合計等於總負債的增減", () => {
      const snapshots = loadSnapshots();
      const result = compareSnapshots(snapshots[0], snapshots.at(-1)!);

      expect(sum(result.cashSources)).toBeCloseTo(
        rowByKey(result.assets, "cash").delta
      );
      expect(sum(result.debts)).toBeCloseTo(
        rowByKey(result.summary, "total-liabilities").delta
      );
    });

    it("各類資產增減合計等於總資產的增減；總資產增減減去總負債增減等於淨資產增減", () => {
      const snapshots = loadSnapshots();
      const result = compareSnapshots(snapshots.at(-2)!, snapshots.at(-1)!);
      const totalAssets = rowByKey(result.summary, "total-assets").delta;
      const totalLiabilities = rowByKey(
        result.summary,
        "total-liabilities"
      ).delta;

      expect(sum(result.assets)).toBeCloseTo(totalAssets);
      expect(totalAssets - totalLiabilities).toBeCloseTo(
        rowByKey(result.summary, "net-worth").delta
      );
    });
  });
});

// PRD 5.10 節「每月定期定額」、第 9 節 #62j～#62l
describe("compareSnapshots：每月定期定額", () => {
  const base = snap("2026-08-31", {
    recurringInvestments: [
      { id: "r1", name: "0050", amount: 10000 },
      { id: "r2", name: "VT", amount: 5000 },
    ],
  });
  const target = snap("2026-09-30", {
    recurringInvestments: [
      { id: "r1", name: "0050", amount: 15000 },
      { id: "r3", name: "QQQ", amount: 3000 },
    ],
  });

  it("合計列比較兩筆快照的定期定額合計", () => {
    const { recurringInvestmentTotal } = compareSnapshots(base, target);

    expect(recurringInvestmentTotal).toMatchObject({
      key: "recurring-investment-total",
      label: "定期定額合計",
      base: 15000,
      target: 18000,
      delta: 3000,
    });
    expect(recurringInvestmentTotal.percent).toBeCloseTo(20);
  });

  it("逐筆以 id 對應：先列對象日的項目，再補上已移除的項目", () => {
    const { recurringInvestments } = compareSnapshots(base, target);

    expect(recurringInvestments.map((row) => row.key)).toEqual([
      "recurring-investment-r1",
      "recurring-investment-r3",
      "recurring-investment-r2",
    ]);
    expect(rowByKey(recurringInvestments, "recurring-investment-r1")).toEqual({
      key: "recurring-investment-r1",
      label: "0050",
      base: 10000,
      target: 15000,
      delta: 5000,
      percent: 50,
    });
    // 新增：基準日沒有這筆，不顯示百分比
    expect(
      rowByKey(recurringInvestments, "recurring-investment-r3")
    ).toMatchObject({ base: null, target: 3000, delta: 3000, percent: null });
    // 已移除：對象日沒有這筆，以 0 計算增減
    expect(
      rowByKey(recurringInvestments, "recurring-investment-r2")
    ).toMatchObject({ label: "VT", base: 5000, target: null, delta: -5000 });
  });

  it("逐筆增減的合計等於定期定額合計的增減", () => {
    const result = compareSnapshots(base, target);

    expect(
      result.recurringInvestments.reduce((total, row) => total + row.delta, 0)
    ).toBe(result.recurringInvestmentTotal.delta);
  });

  it("名稱為空時顯示「未命名」，名稱以對象日為準", () => {
    const { recurringInvestments } = compareSnapshots(
      snap("2026-08-31", {
        recurringInvestments: [{ id: "r1", name: "舊名稱", amount: 1000 }],
      }),
      snap("2026-09-30", {
        recurringInvestments: [
          { id: "r1", name: "新名稱", amount: 1000 },
          { id: "r2", name: "", amount: 2000 },
        ],
      })
    );

    expect(recurringInvestments.map((row) => row.label)).toEqual([
      "新名稱",
      "未命名",
    ]);
  });

  it("只有對象日有定期定額時，合計的基準值為 0、不算百分比", () => {
    const { recurringInvestmentTotal, recurringInvestments } = compareSnapshots(
      snap("2026-08-31"),
      snap("2026-09-30", {
        recurringInvestments: [{ id: "r1", name: "0050", amount: 10000 }],
      })
    );

    expect(recurringInvestmentTotal).toMatchObject({
      base: 0,
      target: 10000,
      delta: 10000,
      percent: null,
    });
    expect(recurringInvestments).toHaveLength(1);
  });

  it("兩筆快照皆無定期定額時逐筆清單為空，合計為 0", () => {
    const result = compareSnapshots(snap("2026-08-31"), snap("2026-09-30"));

    expect(result.recurringInvestments).toEqual([]);
    expect(result.recurringInvestmentTotal).toMatchObject({
      base: 0,
      target: 0,
      delta: 0,
    });
  });

  it("定期定額不影響其他組的比較結果", () => {
    const plainBase = snap("2026-08-31", {
      cashSources: [cash("c1", "銀行", 100000)],
      debts: [debt("d1", "信貸", 50000)],
    });
    const plainTarget = snap("2026-09-30", {
      cashSources: [cash("c1", "銀行", 150000)],
      debts: [debt("d1", "信貸", 40000)],
    });

    const without = compareSnapshots(plainBase, plainTarget);
    const withInvestments = compareSnapshots(
      { ...plainBase, recurringInvestments: base.recurringInvestments },
      { ...plainTarget, recurringInvestments: target.recurringInvestments }
    );

    expect(withInvestments.summary).toEqual(without.summary);
    expect(withInvestments.debtRatio).toEqual(without.debtRatio);
    expect(withInvestments.assets).toEqual(without.assets);
    expect(withInvestments.cashSources).toEqual(without.cashSources);
    expect(withInvestments.debts).toEqual(without.debts);
  });
});
