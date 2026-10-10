import { describe, expect, it } from "vitest";
import { calculateMetrics } from "@/lib/calculations";
import { buildInputSectionSummaries } from "@/lib/inputSections";
import { createEmptySnapshot } from "@/types/schema";
import type { Debt, Snapshot } from "@/types/schema";

// PRD 4.2「輸入區分段收合」第 4 點、第 9 節 #70d

const empty = createEmptySnapshot("2026-10-10");

function debt(id: string, principal: number): Debt {
  return {
    id,
    name: "",
    category: "信貸",
    principal,
    annualRate: 0,
    remainingMonths: 0,
    repaymentMethod: "amortizing",
    collateralValue: 0,
  };
}

const summarize = (snapshot: Snapshot) =>
  buildInputSectionSummaries(snapshot, calculateMetrics(snapshot));

describe("buildInputSectionSummaries", () => {
  it("資產：顯示總資產合計（現金＋股票＋不動產）", () => {
    const summaries = summarize({
      ...empty,
      cashSources: [
        { id: "c", name: "現金", amount: 300000, restricted: false },
      ],
      twStockValue: 700000,
      realEstateValue: 5000000,
    });

    expect(summaries.assets).toBe("合計 $6,000,000");
  });

  it("負債：顯示筆數與總負債；沒有負債時為「尚無負債」", () => {
    expect(summarize(empty).debts).toBe("尚無負債");
    expect(
      summarize({
        ...empty,
        debts: [debt("d1", 3000000), debt("d2", 2000000)],
      }).debts
    ).toBe("2 筆・$5,000,000");
  });

  it("收入與支出：顯示收入合計與本月支出", () => {
    const summaries = summarize({
      ...empty,
      incomeSources: [
        { id: "i1", name: "薪資", amount: 80000 },
        { id: "i2", name: "接案", amount: 20000 },
      ],
      monthlyExpense: 40000,
    });

    expect(summaries.cashFlow).toBe("收入 $100,000・支出 $40,000");
  });

  it("收入與支出：定期定額合計 > 0 時才加上定期定額", () => {
    const base = {
      ...empty,
      incomeSources: [{ id: "i1", name: "薪資", amount: 100000 }],
      monthlyExpense: 40000,
    };

    expect(
      summarize({
        ...base,
        recurringInvestments: [
          { id: "r1", name: "0050", amount: 15000 },
          { id: "r2", name: "VT", amount: 5000 },
        ],
      }).cashFlow
    ).toBe("收入 $100,000・支出 $40,000・定期定額 $20,000");
    expect(
      summarize({
        ...base,
        recurringInvestments: [{ id: "r1", name: "0050", amount: 0 }],
      }).cashFlow
    ).toBe("收入 $100,000・支出 $40,000");
  });

  it("目標：只列出已設定的項目，兩者皆未設定為「尚未設定」", () => {
    expect(summarize(empty).goals).toBe("尚未設定");
    expect(
      summarize({ ...empty, targetNetWorth: 30000000, targetCashRatio: 20 })
        .goals
    ).toBe("淨資產 $30,000,000・現金 20%");
    expect(summarize({ ...empty, targetNetWorth: 30000000 }).goals).toBe(
      "淨資產 $30,000,000"
    );
    expect(summarize({ ...empty, targetCashRatio: 12.5 }).goals).toBe(
      "現金 12.5%"
    );
  });

  it("空白表單不出現 NaN", () => {
    const summaries = summarize(empty);

    expect(summaries).toEqual({
      assets: "合計 $0",
      debts: "尚無負債",
      cashFlow: "收入 $0・支出 $0",
      goals: "尚未設定",
    });
  });
});
