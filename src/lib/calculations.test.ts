import { describe, expect, it } from "vitest";
import { calculateMetrics, toSafeNumber } from "@/lib/calculations";
import type { CashSource } from "@/types/schema";

function baseSnapshotInput(
  overrides: Partial<Parameters<typeof calculateMetrics>[0]> = {}
) {
  return {
    cashSources: [] as CashSource[],
    twStockValue: 0,
    usStockValue: 0,
    exchangeRate: 0,
    loan: 0,
    otherDebt: 0,
    ...overrides,
  };
}

describe("calculateMetrics", () => {
  // PRD 第 9 節 #1：總資產為 0 時負債比須為 0%，不得除以零報錯
  it("總資產為 0 時，負債比為 0%", () => {
    const result = calculateMetrics(baseSnapshotInput());
    expect(result.totalAssets).toBe(0);
    expect(result.debtRatio).toBe(0);
    expect(Number.isFinite(result.debtRatio)).toBe(true);
  });

  // PRD 第 9 節 #2：完全無負債時燈號為「完美無債」
  it("無負債時，燈號為完美無債", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [{ id: "1", name: "現金", amount: 100000 }],
      })
    );
    expect(result.debtRatio).toBe(0);
    expect(result.debtRatioStatus).toBe("debt-free");
  });

  // PRD 第 9 節 #3～#6：負債比邊界值判定
  it.each([
    { ratio: 39.99, expected: "healthy" },
    { ratio: 40, expected: "elevated" },
    { ratio: 60, expected: "elevated" },
    { ratio: 60.01, expected: "high-risk" },
  ])("負債比 $ratio% 時燈號為 $expected", ({ ratio, expected }) => {
    // 以總資產 = 100000 反推負債，讓比例精準命中邊界值
    const totalAssets = 100000;
    const totalLiabilities = (ratio / 100) * totalAssets;
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [{ id: "1", name: "現金", amount: totalAssets }],
        loan: totalLiabilities,
      })
    );
    expect(result.debtRatioStatus).toBe(expected);
  });

  // PRD 第 9 節 #7：現金來源允許負數（透支帳戶）
  it("現金來源允許負數並正確拉低總資產", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "薪轉戶", amount: 50000 },
          { id: "2", name: "信用卡透支戶", amount: -20000 },
        ],
      })
    );
    expect(result.totalCash).toBe(30000);
    expect(result.totalAssets).toBe(30000);
  });

  // PRD 第 9 節 #9：非數字/空值輸入視為 0，不污染其他計算
  it("非數字輸入視為 0", () => {
    expect(toSafeNumber("abc")).toBe(0);
    expect(toSafeNumber("")).toBe(0);
    expect(toSafeNumber(undefined)).toBe(0);
    expect(toSafeNumber(null)).toBe(0);
    expect(toSafeNumber("12000")).toBe(12000);

    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "現金", amount: "abc" as unknown as number },
        ],
        loan: "abc" as unknown as number,
      })
    );
    expect(Number.isNaN(result.totalAssets)).toBe(false);
    expect(Number.isNaN(result.debtRatio)).toBe(false);
  });

  // PRD 第 9 節 #10：台股/美股/匯率換算
  it("股票市值合計 = 台股 + 美股 × 匯率", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        twStockValue: 100000,
        usStockValue: 1000,
        exchangeRate: 32,
      })
    );
    expect(result.totalStockValue).toBe(100000 + 1000 * 32);
  });

  it("完整案例：資產、負債、淨資產、負債比一致", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "手邊現金", amount: 12000 },
          { id: "2", name: "中國信託", amount: 150000 },
        ],
        twStockValue: 320000,
        usStockValue: 9000,
        exchangeRate: 32.7,
        loan: 300000,
        otherDebt: 15000,
      })
    );
    const totalCash = 12000 + 150000;
    const totalStockValue = 320000 + 9000 * 32.7;
    const totalAssets = totalCash + totalStockValue;
    const totalLiabilities = 300000 + 15000;
    expect(result.totalAssets).toBeCloseTo(totalAssets);
    expect(result.totalLiabilities).toBe(totalLiabilities);
    expect(result.netWorth).toBeCloseTo(totalAssets - totalLiabilities);
    expect(result.debtRatio).toBeCloseTo(
      (totalLiabilities / totalAssets) * 100
    );
  });
});
