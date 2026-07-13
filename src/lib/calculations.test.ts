import { describe, expect, it } from "vitest";
import {
  calculateMetrics,
  calculateMonthlyPayment,
  calculateTotalMonthlyDebtPayment,
  toSafeNumber,
} from "@/lib/calculations";
import type { CashSource, Debt, IncomeSource } from "@/types/schema";

function baseDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "d1",
    name: "測試負債",
    category: "信貸",
    principal: 0,
    annualRate: 0,
    remainingMonths: 0,
    repaymentMethod: "amortizing",
    ...overrides,
  };
}

function baseSnapshotInput(
  overrides: Partial<Parameters<typeof calculateMetrics>[0]> = {}
) {
  return {
    cashSources: [] as CashSource[],
    twStockValue: 0,
    usStockValue: 0,
    usStockCurrency: "USD" as const,
    exchangeRate: 0,
    debts: [] as Debt[],
    incomeSources: [] as IncomeSource[],
    monthlyExpense: 0,
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
        debts: [baseDebt({ principal: totalLiabilities })],
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
        debts: [baseDebt({ principal: "abc" as unknown as number })],
      })
    );
    expect(Number.isNaN(result.totalAssets)).toBe(false);
    expect(Number.isNaN(result.debtRatio)).toBe(false);
  });

  // PRD 第 9 節 #10：台股/美股/匯率換算（美股以 USD 計價時）
  it("美股以 USD 計價時，股票市值合計 = 台股 + 美股 × 匯率", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        twStockValue: 100000,
        usStockValue: 1000,
        usStockCurrency: "USD",
        exchangeRate: 32,
      })
    );
    expect(result.totalStockValue).toBe(100000 + 1000 * 32);
  });

  // 美股改以 TWD 計價時，直接採用使用者輸入的台幣等值金額，不再乘匯率
  it("美股以 TWD 計價時，股票市值合計 = 台股 + 美股（不乘匯率）", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        twStockValue: 100000,
        usStockValue: 32000,
        usStockCurrency: "TWD",
        exchangeRate: 32, // 刻意保留匯率值，驗證此模式下不會被誤用
      })
    );
    expect(result.totalStockValue).toBe(100000 + 32000);
  });

  it("總資產為 0 時，現金比例為 0%", () => {
    const result = calculateMetrics(baseSnapshotInput());
    expect(result.cashRatio).toBe(0);
    expect(Number.isFinite(result.cashRatio)).toBe(true);
  });

  it("現金比例 = 總現金 / 總資產 × 100", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [{ id: "1", name: "現金", amount: 30000 }],
        twStockValue: 70000,
      })
    );
    expect(result.cashRatio).toBeCloseTo(30);
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
        debts: [
          baseDebt({ id: "d1", category: "房貸", principal: 300000 }),
          baseDebt({ id: "d2", category: "其他", principal: 15000 }),
        ],
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
    expect(result.cashRatio).toBeCloseTo((totalCash / totalAssets) * 100);
  });

  // 現金流 = 總收入 − 本月支出 − 本月應還款總額（PRD 5.3 節），不再由使用者手動輸入
  it("現金流 = 收入合計 − 本月支出 − 本月應還款總額", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        incomeSources: [
          { id: "i1", name: "薪資", amount: 60000 },
          { id: "i2", name: "接案", amount: 8000 },
        ],
        monthlyExpense: 22000,
        debts: [
          baseDebt({
            principal: 500000,
            annualRate: 3.5,
            remainingMonths: 12,
            repaymentMethod: "interestOnly",
          }),
        ],
      })
    );
    const totalIncome = 68000;
    const monthlyDebtPayment = 500000 * (3.5 / 100 / 12);
    expect(result.totalIncome).toBe(totalIncome);
    expect(result.totalMonthlyDebtPayment).toBeCloseTo(monthlyDebtPayment);
    expect(result.cashFlow).toBeCloseTo(
      totalIncome - 22000 - monthlyDebtPayment
    );
  });

  it("負債清單可為空，總負債與本月應還款總額皆為 0，不報錯", () => {
    const result = calculateMetrics(baseSnapshotInput());
    expect(result.totalLiabilities).toBe(0);
    expect(result.totalMonthlyDebtPayment).toBe(0);
    expect(result.debtRatioStatus).toBe("debt-free");
  });
});

describe("calculateMonthlyPayment", () => {
  // PRD 第 9 節 #21：本息平均攤還月付試算，以標準 PMT 公式驗證
  it("本息平均攤還：月付金額等於標準 PMT 公式結果", () => {
    const principal = 5000000;
    const annualRate = 2.1;
    const remainingMonths = 240;
    const monthlyRate = annualRate / 100 / 12;
    const factor = Math.pow(1 + monthlyRate, remainingMonths);
    const expectedPayment = (principal * (monthlyRate * factor)) / (factor - 1);

    const payment = calculateMonthlyPayment(
      baseDebt({
        principal,
        annualRate,
        remainingMonths,
        repaymentMethod: "amortizing",
      })
    );
    expect(payment).toBeCloseTo(expectedPayment);
  });

  // PRD 第 9 節 #22：只計息簡化為「年利率 ÷ 12」
  it("只計息：月付金額 = 本金 × 年利率 ÷ 12", () => {
    const payment = calculateMonthlyPayment(
      baseDebt({
        principal: 500000,
        annualRate: 3.5,
        remainingMonths: 12,
        repaymentMethod: "interestOnly",
      })
    );
    expect(payment).toBeCloseTo(500000 * (3.5 / 100 / 12));
  });

  // PRD 第 9 節 #24：剩餘期數為 0 時月付視為 0，避免除以零或 NaN/Infinity
  it("剩餘期數為 0 時，本息平均攤還月付視為 0", () => {
    const payment = calculateMonthlyPayment(
      baseDebt({
        principal: 100000,
        annualRate: 2,
        remainingMonths: 0,
        repaymentMethod: "amortizing",
      })
    );
    expect(payment).toBe(0);
    expect(Number.isFinite(payment)).toBe(true);
  });

  it("年利率為 0 的本息平均攤還：月付 = 本金 / 剩餘期數", () => {
    const payment = calculateMonthlyPayment(
      baseDebt({
        principal: 120000,
        annualRate: 0,
        remainingMonths: 12,
        repaymentMethod: "amortizing",
      })
    );
    expect(payment).toBeCloseTo(10000);
  });

  it("calculateTotalMonthlyDebtPayment 為所有負債月付加總", () => {
    const debts: Debt[] = [
      baseDebt({
        id: "d1",
        principal: 120000,
        annualRate: 0,
        remainingMonths: 12,
        repaymentMethod: "amortizing",
      }),
      baseDebt({
        id: "d2",
        principal: 500000,
        annualRate: 3.5,
        remainingMonths: 12,
        repaymentMethod: "interestOnly",
      }),
    ];
    const total = calculateTotalMonthlyDebtPayment(debts);
    expect(total).toBeCloseTo(10000 + 500000 * (3.5 / 100 / 12));
  });
});
