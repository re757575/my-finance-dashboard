import { describe, expect, it } from "vitest";
import {
  advanceDebtByMonths,
  calculateEmergencyFundMonths,
  calculateEmergencyFundStatus,
  calculateGoalProgress,
  calculateMetrics,
  calculateMonthlyPayment,
  calculateSavingsRate,
  calculateSavingsRateStatus,
  calculateSuggestedTargetNetWorth,
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
    targetNetWorth: 0,
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

  // PRD 第 9 節 #29：資產配置比例三類加總為 100%
  it("資產配置比例：現金/台股/美股佔總資產比例加總為 100%", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [{ id: "1", name: "現金", amount: 350000 }],
        twStockValue: 400000,
        usStockValue: 250000,
        usStockCurrency: "TWD",
      })
    );
    expect(result.cashRatio).toBeCloseTo(35);
    expect(result.twStockRatio).toBeCloseTo(40);
    expect(result.usStockRatio).toBeCloseTo(25);
  });

  // PRD 第 9 節 #29a：總資產為 0 時三類比例皆為 0，不得除以零報錯
  it("資產配置比例：總資產為 0 時三類比例皆為 0", () => {
    const result = calculateMetrics(baseSnapshotInput());
    expect(result.cashRatio).toBe(0);
    expect(result.twStockRatio).toBe(0);
    expect(result.usStockRatio).toBe(0);
  });

  // PRD 第 9 節 #27：緊急預備金月數計算
  it("緊急預備金月數 = 總流動現金 ÷（本月支出 + 本月應還款總額）", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [{ id: "1", name: "現金", amount: 300000 }],
        monthlyExpense: 20000,
        debts: [
          baseDebt({
            principal: 500000,
            annualRate: 2.4,
            remainingMonths: 12,
            repaymentMethod: "interestOnly",
          }),
        ],
      })
    );
    const totalMonthlyDebtPayment = 500000 * (2.4 / 100 / 12);
    expect(result.totalMonthlyDebtPayment).toBeCloseTo(totalMonthlyDebtPayment);
    expect(result.emergencyFundMonths).toBeCloseTo(
      300000 / (20000 + totalMonthlyDebtPayment)
    );
  });

  // PRD 第 9 節 #27a：分母為 0 時，緊急預備金月數為 null（顯示「無需求」），不得除以零報錯
  it("緊急預備金分母為 0 時，月數為 null（無需求）", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [{ id: "1", name: "現金", amount: 300000 }],
      })
    );
    expect(result.emergencyFundMonths).toBeNull();
    expect(result.emergencyFundStatus).toBe("no-need");
  });

  // PRD 第 9 節 #28：儲蓄率計算
  it("儲蓄率 = 現金流 ÷ 總收入 × 100", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        incomeSources: [{ id: "i1", name: "薪資", amount: 68000 }],
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
    const monthlyDebtPayment = 500000 * (3.5 / 100 / 12);
    const cashFlow = 68000 - 22000 - monthlyDebtPayment;
    expect(result.savingsRate).toBeCloseTo((cashFlow / 68000) * 100);
    expect(result.savingsRateStatus).toBe("high");
  });

  // PRD 第 9 節 #28a：總收入為 0 時，儲蓄率強制為 0%，不得除以零報錯
  it("總收入為 0 時，儲蓄率為 0%", () => {
    const result = calculateMetrics(baseSnapshotInput());
    expect(result.savingsRate).toBe(0);
    expect(Number.isFinite(result.savingsRate)).toBe(true);
  });

  // PRD 第 9 節 #31：FIRE 目標進度計算
  it("FIRE 目標進度 = 淨資產 ÷ 目標淨資產 × 100", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [{ id: "1", name: "現金", amount: 3500000 }],
        targetNetWorth: 10000000,
      })
    );
    expect(result.goalProgress).toBeCloseTo(35);
  });

  // PRD 第 9 節 #31a：目標淨資產為 0（未設定）時，進度為 null，不得除以零報錯
  it("目標淨資產為 0 時，goalProgress 為 null", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [{ id: "1", name: "現金", amount: 3500000 }],
        targetNetWorth: 0,
      })
    );
    expect(result.goalProgress).toBeNull();
  });
});

describe("calculateEmergencyFundMonths / calculateEmergencyFundStatus", () => {
  // PRD 第 9 節 #27b：門檻邊界（3 個月整）為「基本安全」，非「預備金不足」
  it("月數恰為 3 時，狀態為基本安全", () => {
    expect(calculateEmergencyFundStatus(3)).toBe("basic");
  });

  // PRD 第 9 節 #27c：門檻邊界（6 個月整）為「預備充足」，非「基本安全」
  it("月數恰為 6 時，狀態為預備充足", () => {
    expect(calculateEmergencyFundStatus(6)).toBe("sufficient");
  });

  it("月數小於 3 時，狀態為預備金不足", () => {
    expect(calculateEmergencyFundStatus(2.9)).toBe("insufficient");
  });

  it("分母為 0 時回傳 null", () => {
    expect(calculateEmergencyFundMonths(100000, 0, 0)).toBeNull();
  });
});

describe("calculateSavingsRate / calculateSavingsRateStatus", () => {
  // PRD 第 9 節 #28b：現金流為負時，狀態為「入不敷出」
  it("現金流為負時，儲蓄率為負且狀態為入不敷出", () => {
    const rate = calculateSavingsRate(-5000, 60000);
    expect(rate).toBeLessThan(0);
    expect(calculateSavingsRateStatus(rate)).toBe("negative");
  });

  it("儲蓄率邊界：0% ~ 10% 為儲蓄偏低，10% ~ 20% 為儲蓄健康，20% 以上為高儲蓄率", () => {
    expect(calculateSavingsRateStatus(0)).toBe("low");
    expect(calculateSavingsRateStatus(9.99)).toBe("low");
    expect(calculateSavingsRateStatus(10)).toBe("healthy");
    expect(calculateSavingsRateStatus(19.99)).toBe("healthy");
    expect(calculateSavingsRateStatus(20)).toBe("high");
  });

  it("總收入為 0 時，儲蓄率為 0", () => {
    expect(calculateSavingsRate(0, 0)).toBe(0);
  });
});

describe("calculateSuggestedTargetNetWorth / calculateGoalProgress", () => {
  it("建議目標淨資產 = 本月支出 × 12 × 25（4% 提領法則）", () => {
    expect(calculateSuggestedTargetNetWorth(30000)).toBe(9000000);
  });

  it("本月支出為 0 時，建議值為 0", () => {
    expect(calculateSuggestedTargetNetWorth(0)).toBe(0);
  });

  it("目標為 0 時，進度為 null", () => {
    expect(calculateGoalProgress(3500000, 0)).toBeNull();
  });

  // PRD 第 9 節 #31c：超過目標時不封頂，如實回傳超過 100% 的數字
  it("淨資產超過目標時，進度可超過 100%", () => {
    expect(calculateGoalProgress(14200000, 10000000)).toBeCloseTo(142);
  });

  // PRD 第 9 節 #31d：淨資產為負數時，回傳負數（由 UI 端負責夾住進度條寬度）
  it("淨資產為負數時，回傳負百分比", () => {
    expect(calculateGoalProgress(-500000, 10000000)).toBeCloseTo(-5);
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

describe("advanceDebtByMonths", () => {
  it("經過的月數 ≤ 0 時，不做任何變動", () => {
    const debt = baseDebt({ principal: 100000, remainingMonths: 12 });
    expect(advanceDebtByMonths(debt, 0)).toEqual(debt);
    expect(advanceDebtByMonths(debt, -3)).toEqual(debt);
  });

  it("負債已到期（剩餘期數為 0）時，不做任何變動", () => {
    const debt = baseDebt({
      principal: 100000,
      remainingMonths: 0,
      repaymentMethod: "interestOnly",
    });
    expect(advanceDebtByMonths(debt, 6)).toEqual(debt);
  });

  it("本息平均攤還：往前推進 k 期後，剩餘本金依攤還表遞減、剩餘期數同步遞減", () => {
    const principal = 5000000;
    const annualRate = 2.4;
    const remainingMonths = 240;
    const monthsElapsed = 12;
    const monthlyRate = annualRate / 100 / 12;
    const factor240 = Math.pow(1 + monthlyRate, remainingMonths);
    const payment = (principal * (monthlyRate * factor240)) / (factor240 - 1);
    const factorK = Math.pow(1 + monthlyRate, monthsElapsed);
    const expectedBalance =
      principal * factorK - (payment * (factorK - 1)) / monthlyRate;

    const advanced = advanceDebtByMonths(
      baseDebt({ principal, annualRate, remainingMonths }),
      monthsElapsed
    );

    expect(advanced.remainingMonths).toBe(228);
    expect(advanced.principal).toBeCloseTo(expectedBalance, 2);
  });

  it("只計息：往前推進 k 期後，本金維持不變，只遞減剩餘期數", () => {
    const debt = baseDebt({
      principal: 500000,
      annualRate: 3.5,
      remainingMonths: 12,
      repaymentMethod: "interestOnly",
    });
    const advanced = advanceDebtByMonths(debt, 5);
    expect(advanced.principal).toBe(500000);
    expect(advanced.remainingMonths).toBe(7);
  });

  it("本息平均攤還：推進期數超過剩餘期數時視為清償完畢，本金與期數皆歸零", () => {
    const debt = baseDebt({
      principal: 50000,
      annualRate: 2,
      remainingMonths: 3,
    });
    const advanced = advanceDebtByMonths(debt, 12);
    expect(advanced.remainingMonths).toBe(0);
    expect(advanced.principal).toBe(0);
  });

  it("只計息：推進期數超過剩餘期數時只有期數歸零，本金維持不變（到期須一次還清，非自動清償）", () => {
    const debt = baseDebt({
      principal: 500000,
      annualRate: 3.5,
      remainingMonths: 3,
      repaymentMethod: "interestOnly",
    });
    const advanced = advanceDebtByMonths(debt, 12);
    expect(advanced.remainingMonths).toBe(0);
    expect(advanced.principal).toBe(500000);
  });
});
