import { describe, expect, it } from "vitest";
import {
  advanceDebtByMonths,
  calculateDebtServiceRatio,
  calculateDebtServiceRatioStatus,
  calculateEmergencyFundMonths,
  calculateEmergencyFundStatus,
  calculateFinancialDebtRatio,
  calculateGoalEstimates,
  calculateGoalEta,
  calculateGoalProgress,
  calculateHistoricalMonthlyPace,
  calculateMetrics,
  calculateMonthlyPayment,
  calculateMonthlyPrincipalRepayment,
  calculatePledgeMaintenance,
  calculatePledgeMaintenanceStatus,
  calculateSavingsRate,
  calculateStressScenario,
  calculateSavingsRateStatus,
  calculateSuggestedTargetNetWorth,
  calculateTotalMonthlyDebtPayment,
  calculateTotalMonthlyPrincipalRepayment,
  GOAL_ETA_MAX_MONTHS,
  hasSeparateFinancialDebtRatio,
  STRESS_TEST_DROPS,
  sumFinancialDebtPrincipal,
  toSafeNumber,
} from "@/lib/calculations";
import {
  createEmptySnapshot,
  type CashSource,
  type Debt,
  type IncomeSource,
  type Snapshot,
} from "@/types/schema";

function baseDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "d1",
    name: "測試負債",
    category: "信貸",
    principal: 0,
    annualRate: 0,
    remainingMonths: 0,
    repaymentMethod: "amortizing",
    collateralValue: 0,
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
    realEstateValue: 0,
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
        cashSources: [
          { id: "1", name: "現金", amount: 100000, restricted: false },
        ],
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
        cashSources: [
          { id: "1", name: "現金", amount: totalAssets, restricted: false },
        ],
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
          { id: "1", name: "薪轉戶", amount: 50000, restricted: false },
          { id: "2", name: "信用卡透支戶", amount: -20000, restricted: false },
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
          {
            id: "1",
            name: "現金",
            amount: "abc" as unknown as number,
            restricted: false,
          },
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
        cashSources: [
          { id: "1", name: "現金", amount: 30000, restricted: false },
        ],
        twStockValue: 70000,
      })
    );
    expect(result.cashRatio).toBeCloseTo(30);
  });

  it("完整案例：資產、負債、淨資產、負債比一致", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "手邊現金", amount: 12000, restricted: false },
          { id: "2", name: "中國信託", amount: 150000, restricted: false },
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
        cashSources: [
          { id: "1", name: "現金", amount: 350000, restricted: false },
        ],
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
        cashSources: [
          { id: "1", name: "現金", amount: 300000, restricted: false },
        ],
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
        cashSources: [
          { id: "1", name: "現金", amount: 300000, restricted: false },
        ],
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
        cashSources: [
          { id: "1", name: "現金", amount: 3500000, restricted: false },
        ],
        targetNetWorth: 10000000,
      })
    );
    expect(result.goalProgress).toBeCloseTo(35);
  });

  // PRD 第 9 節 #31a：目標淨資產為 0（未設定）時，進度為 null，不得除以零報錯
  it("目標淨資產為 0 時，goalProgress 為 null", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "現金", amount: 3500000, restricted: false },
        ],
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

// PRD 5.2b 節、第 9 節 #61a–#61g：償債負擔率 = 本月應還款總額 ÷ 總收入 × 100%
describe("償債負擔率（PRD 5.2b 節）", () => {
  describe("calculateDebtServiceRatio", () => {
    it("本月應還款總額 ÷ 總收入 × 100", () => {
      expect(calculateDebtServiceRatio(12000, 60000)).toBe(20);
      expect(calculateDebtServiceRatio(25481, 68000)).toBeCloseTo(37.472, 3);
    });

    it("本月應還款總額為 0 時為 0，不論總收入是否為 0", () => {
      expect(calculateDebtServiceRatio(0, 60000)).toBe(0);
      expect(calculateDebtServiceRatio(0, 0)).toBe(0);
    });

    it("總收入為 0 但有應還款時無法計算，回傳 null 而非 NaN／Infinity", () => {
      expect(calculateDebtServiceRatio(12000, 0)).toBeNull();
    });

    it("超過 100% 時如實回傳，不封頂", () => {
      expect(calculateDebtServiceRatio(12000, 10000)).toBe(120);
    });
  });

  describe("calculateDebtServiceRatioStatus", () => {
    it.each([
      { ratio: 0, status: "no-payment" },
      { ratio: 0.01, status: "comfortable" },
      { ratio: 29.99, status: "comfortable" },
      { ratio: 30, status: "heavy" },
      { ratio: 35, status: "heavy" },
      { ratio: 40, status: "heavy" },
      { ratio: 40.01, status: "excessive" },
      { ratio: 120, status: "excessive" },
      { ratio: null, status: "no-income" },
    ])("比率 $ratio 的狀態為 $status", ({ ratio, status }) => {
      expect(calculateDebtServiceRatioStatus(ratio)).toBe(status);
    });
  });

  describe("calculateMetrics", () => {
    // 年利率 0% 的本息平均攤還：月付 = 144,000 ÷ 12 = 12,000
    const debts = [
      baseDebt({ principal: 144000, annualRate: 0, remainingMonths: 12 }),
    ];
    const income = (amount: number): IncomeSource[] => [
      { id: "i1", name: "薪資", amount },
    ];

    it.each([
      { amount: 60000, ratio: 20, status: "comfortable" },
      { amount: 40000, ratio: 30, status: "heavy" },
      { amount: 30000, ratio: 40, status: "heavy" },
      { amount: 25000, ratio: 48, status: "excessive" },
      { amount: 10000, ratio: 120, status: "excessive" },
    ])(
      "月付 12,000、總收入 $amount → $ratio%（$status）",
      ({ amount, ratio, status }) => {
        const metrics = calculateMetrics(
          baseSnapshotInput({ debts, incomeSources: income(amount) })
        );
        expect(metrics.totalMonthlyDebtPayment).toBe(12000);
        expect(metrics.debtServiceRatio).toBe(ratio);
        expect(metrics.debtServiceRatioStatus).toBe(status);
      }
    );

    it("沒有負債時為 0%、無還款負擔（有無收入皆同）", () => {
      for (const incomeSources of [income(60000), []]) {
        const metrics = calculateMetrics(baseSnapshotInput({ incomeSources }));
        expect(metrics.debtServiceRatio).toBe(0);
        expect(metrics.debtServiceRatioStatus).toBe("no-payment");
      }
    });

    it("已到期（剩餘期數 0）的負債沒有月付金，視為無還款負擔", () => {
      const metrics = calculateMetrics(
        baseSnapshotInput({
          debts: [baseDebt({ principal: 144000, remainingMonths: 0 })],
          incomeSources: income(60000),
        })
      );
      expect(metrics.debtServiceRatio).toBe(0);
      expect(metrics.debtServiceRatioStatus).toBe("no-payment");
    });

    it("總收入為 0 但有應還款時為 null、無收入可負擔", () => {
      const metrics = calculateMetrics(baseSnapshotInput({ debts }));
      expect(metrics.totalIncome).toBe(0);
      expect(metrics.debtServiceRatio).toBeNull();
      expect(metrics.debtServiceRatioStatus).toBe("no-income");
    });

    it("收入金額為非數字時視為 0，不產生 NaN", () => {
      const metrics = calculateMetrics(
        baseSnapshotInput({
          debts,
          incomeSources: income(Number.NaN),
        })
      );
      expect(metrics.debtServiceRatio).toBeNull();
      expect(metrics.debtServiceRatioStatus).toBe("no-income");
    });
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

// PRD 第 9 節 #40／#40a／#40c：不可動用現金（如期貨保證金）
describe("calculateMetrics：不可動用現金", () => {
  const cash = (
    id: string,
    amount: number,
    restricted = false
  ): CashSource => ({
    id,
    name: id,
    amount,
    restricted,
  });

  it("不可動用現金仍計入總現金與總資產，但不計入可動用現金", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [cash("一般", 200000), cash("期貨保證金", 100000, true)],
      })
    );
    expect(result.totalCash).toBe(300000);
    expect(result.liquidCash).toBe(200000);
    expect(result.restrictedCash).toBe(100000);
    expect(result.totalAssets).toBe(300000);
  });

  it("緊急預備金月數的分子只計可動用現金", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [cash("一般", 200000), cash("期貨保證金", 100000, true)],
        monthlyExpense: 20000,
        debts: [
          baseDebt({ principal: 120000, remainingMonths: 12, annualRate: 0 }),
        ],
      })
    );
    // 月付 = 120000 ÷ 12 = 10000，分母 30000；分子 200000（不含保證金）
    expect(result.emergencyFundMonths).toBeCloseTo(200000 / 30000, 5);
  });

  it("現金比例與各類配置比例以金融資產為分母，四項加總為 100%", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [cash("一般", 200000), cash("期貨保證金", 100000, true)],
        twStockValue: 400000,
        usStockValue: 300000,
        usStockCurrency: "TWD",
      })
    );
    expect(result.financialAssets).toBe(1000000);
    expect(result.cashRatio).toBeCloseTo(20, 5);
    expect(result.restrictedCashRatio).toBeCloseTo(10, 5);
    expect(result.twStockRatio).toBeCloseTo(40, 5);
    expect(result.usStockRatio).toBeCloseTo(30, 5);
    expect(
      result.cashRatio +
        result.restrictedCashRatio +
        result.twStockRatio +
        result.usStockRatio
    ).toBeCloseTo(100, 5);
  });

  it("沒有標記不可動用時，與舊算法一致（可動用現金＝總現金）", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [cash("A", 350000)],
        twStockValue: 650000,
      })
    );
    expect(result.liquidCash).toBe(result.totalCash);
    expect(result.restrictedCash).toBe(0);
    expect(result.cashRatio).toBeCloseTo(35, 5);
  });

  it("缺少 restricted 欄位（舊資料）視為可動用", () => {
    const legacy = { id: "x", name: "舊資料", amount: 1000 } as CashSource;
    const result = calculateMetrics(
      baseSnapshotInput({ cashSources: [legacy] })
    );
    expect(result.liquidCash).toBe(1000);
    expect(result.restrictedCash).toBe(0);
  });
});

// PRD 第 9 節 #41／#41a／#41b：不動產市值
describe("calculateMetrics：不動產市值", () => {
  it("計入總資產與淨資產，負債比以含不動產的總資產為分母", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "現金", amount: 200000, restricted: false },
        ],
        twStockValue: 300000,
        realEstateValue: 10000000,
        debts: [baseDebt({ principal: 6000000 })],
      })
    );
    expect(result.totalAssets).toBe(10500000);
    expect(result.netWorth).toBe(4500000);
    expect(result.debtRatio).toBeCloseTo((6000000 / 10500000) * 100, 5);
  });

  it("不計入金融資產：現金比例與配置比例的分母不含不動產", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "現金", amount: 200000, restricted: false },
        ],
        twStockValue: 300000,
        realEstateValue: 10000000,
      })
    );
    expect(result.financialAssets).toBe(500000);
    expect(result.realEstateValue).toBe(10000000);
    expect(result.cashRatio).toBeCloseTo(40, 5);
    expect(result.twStockRatio).toBeCloseTo(60, 5);
  });

  it("不動產為 0（或缺少欄位）時，與舊算法一致", () => {
    const withZero = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "現金", amount: 100000, restricted: false },
        ],
      })
    );
    expect(withZero.totalAssets).toBe(100000);
    expect(withZero.realEstateValue).toBe(0);

    const missing = calculateMetrics({
      ...baseSnapshotInput(),
      realEstateValue: undefined as unknown as number,
    });
    expect(missing.realEstateValue).toBe(0);
    expect(Number.isFinite(missing.totalAssets)).toBe(true);
  });

  it("只有不動產、沒有金融資產時，各配置比例為 0，不得除以零", () => {
    const result = calculateMetrics(
      baseSnapshotInput({ realEstateValue: 5000000 })
    );
    expect(result.financialAssets).toBe(0);
    expect(result.cashRatio).toBe(0);
    expect(result.twStockRatio).toBe(0);
    expect(result.usStockRatio).toBe(0);
    expect(result.totalAssets).toBe(5000000);
  });
});

// PRD 第 9 節 #42／#42a／#42b／#42c／#42d：質押整戶維持率
describe("calculatePledgeMaintenanceStatus", () => {
  it.each([
    { ratio: 200, status: "safe" },
    { ratio: 160, status: "safe" },
    { ratio: 159.9, status: "watch" },
    { ratio: 140, status: "watch" },
    { ratio: 139.9, status: "warning" },
    { ratio: 130, status: "warning" },
    { ratio: 129.9, status: "margin-call" },
    { ratio: 50, status: "margin-call" },
  ])("維持率 $ratio% → $status", ({ ratio, status }) => {
    expect(calculatePledgeMaintenanceStatus(ratio)).toBe(status);
  });
});

describe("calculatePledgeMaintenance", () => {
  const pledge = (principal: number, collateralValue: number) =>
    baseDebt({
      category: "質押",
      principal,
      collateralValue,
      repaymentMethod: "interestOnly",
    });

  it("質押股票市值 ÷ 質押本金：800,000 ÷ 500,000 = 160%，距追繳線可再跌 18.75%", () => {
    const result = calculatePledgeMaintenance([pledge(500000, 800000)]);
    expect(result.ratio).toBeCloseTo(160, 5);
    expect(result.status).toBe("safe");
    expect(result.dropToMarginCall).toBeCloseTo(18.75, 5);
  });

  it("恰為 130% 時為「接近追繳線」，下跌空間為 0", () => {
    const result = calculatePledgeMaintenance([pledge(500000, 650000)]);
    expect(result.ratio).toBeCloseTo(130, 5);
    expect(result.status).toBe("warning");
    expect(result.dropToMarginCall).toBeCloseTo(0, 5);
  });

  it("低於 130% 時為「低於追繳線」，不提供下跌空間", () => {
    const result = calculatePledgeMaintenance([pledge(500000, 649000)]);
    expect(result.status).toBe("margin-call");
    expect(result.dropToMarginCall).toBeNull();
  });

  it("多筆質押負債合併計算整戶維持率", () => {
    const result = calculatePledgeMaintenance([
      pledge(300000, 500000),
      pledge(200000, 300000),
    ]);
    expect(result.principal).toBe(500000);
    expect(result.collateralValue).toBe(800000);
    expect(result.ratio).toBeCloseTo(160, 5);
  });

  it("尚未填寫質押股票市值時為 unset，不計算百分比", () => {
    const result = calculatePledgeMaintenance([pledge(500000, 0)]);
    expect(result.status).toBe("unset");
    expect(result.ratio).toBeNull();
    expect(result.dropToMarginCall).toBeNull();
  });

  it("沒有質押負債，或質押本金為 0 時為 none", () => {
    expect(calculatePledgeMaintenance([]).status).toBe("none");
    expect(
      calculatePledgeMaintenance([
        baseDebt({ category: "房貸", principal: 1e6 }),
      ]).status
    ).toBe("none");
    expect(calculatePledgeMaintenance([pledge(0, 100000)]).status).toBe("none");
  });

  it("非質押類別負債即使有 collateralValue 也不參與計算", () => {
    const result = calculatePledgeMaintenance([
      pledge(500000, 800000),
      baseDebt({
        category: "信貸",
        principal: 1000000,
        collateralValue: 999999,
      }),
    ]);
    expect(result.principal).toBe(500000);
    expect(result.collateralValue).toBe(800000);
  });

  it("calculateMetrics 會帶出質押維持率相關指標", () => {
    const result = calculateMetrics(
      baseSnapshotInput({ debts: [pledge(500000, 800000)] })
    );
    expect(result.pledgePrincipal).toBe(500000);
    expect(result.pledgeCollateralValue).toBe(800000);
    expect(result.pledgeMaintenanceRatio).toBeCloseTo(160, 5);
    expect(result.pledgeMaintenanceStatus).toBe("safe");
    expect(result.pledgeDropToMarginCall).toBeCloseTo(18.75, 5);
  });
});

// PRD 第 9 節 #44～#44e：股票壓力測試
describe("calculateStressScenario", () => {
  const cash = (amount: number, restricted = false): CashSource => ({
    id: "c",
    name: "現金",
    amount,
    restricted,
  });
  const pledge = (principal: number, collateralValue: number) =>
    baseDebt({
      category: "質押",
      principal,
      collateralValue,
      repaymentMethod: "interestOnly",
    });

  it("提供 −10%／−20%／−30% 三個一鍵情境", () => {
    expect(STRESS_TEST_DROPS).toEqual([10, 20, 30]);
  });

  it("台股與美股同步下跌：淨資產與負債比依新股票市值重新計算", () => {
    const snapshot = baseSnapshotInput({
      cashSources: [cash(300000)],
      twStockValue: 400000,
      usStockValue: 300000,
      usStockCurrency: "TWD",
      debts: [baseDebt({ category: "房貸", principal: 400000 })],
    });

    const result = calculateStressScenario(snapshot, 20);

    expect(result.before.totalStockValue).toBe(700000);
    expect(result.after.totalStockValue).toBeCloseTo(560000, 5);
    expect(result.before.netWorth).toBe(600000);
    expect(result.after.netWorth).toBeCloseTo(460000, 5);
    expect(result.netWorthChange).toBeCloseTo(-140000, 5);
    expect(result.netWorthChangeRate).toBeCloseTo((-140000 / 600000) * 100, 5);
    expect(result.before.debtRatio).toBeCloseTo(40, 5);
    expect(result.after.debtRatio).toBeCloseTo((400000 / 860000) * 100, 5);
  });

  it("美股以 USD 計價時，美金市值下跌、匯率不變", () => {
    const snapshot = baseSnapshotInput({
      usStockValue: 10000,
      usStockCurrency: "USD",
      exchangeRate: 30,
    });

    const result = calculateStressScenario(snapshot, 30);

    expect(result.before.totalStockValue).toBe(300000);
    expect(result.after.totalStockValue).toBeCloseTo(210000, 5);
  });

  it("現金（含不可動用現金）、不動產與負債本金不受影響", () => {
    const snapshot = baseSnapshotInput({
      cashSources: [cash(150000), cash(50000, true)],
      twStockValue: 300000,
      realEstateValue: 10000000,
      debts: [baseDebt({ category: "房貸", principal: 2000000 })],
    });

    const result = calculateStressScenario(snapshot, 30);

    expect(result.after.totalCash).toBe(200000);
    expect(result.after.restrictedCash).toBe(50000);
    expect(result.after.realEstateValue).toBe(10000000);
    expect(result.after.totalLiabilities).toBe(2000000);
    // 只有股票 300,000 × 30% = 90,000 的損失
    expect(result.netWorthChange).toBeCloseTo(-90000, 5);
  });

  it("質押股票市值同比例下跌：−20% 時 160% → 128%，跌破 130% 追繳線", () => {
    const snapshot = baseSnapshotInput({
      twStockValue: 1000000,
      debts: [pledge(500000, 800000)],
    });

    const result = calculateStressScenario(snapshot, 20);

    expect(result.before.pledgeMaintenanceRatio).toBeCloseTo(160, 5);
    expect(result.after.pledgeMaintenanceRatio).toBeCloseTo(128, 5);
    expect(result.after.pledgeMaintenanceStatus).toBe("margin-call");
  });

  it("質押維持率在較輕微的情境下仍高於追繳線：−10% 時 144%（維持率留意）", () => {
    const snapshot = baseSnapshotInput({
      twStockValue: 1000000,
      debts: [pledge(500000, 800000)],
    });

    const result = calculateStressScenario(snapshot, 10);

    expect(result.after.pledgeMaintenanceRatio).toBeCloseTo(144, 5);
    expect(result.after.pledgeMaintenanceStatus).toBe("watch");
  });

  it("非質押類別負債的 collateralValue 不受影響，也不參與維持率", () => {
    const snapshot = baseSnapshotInput({
      twStockValue: 1000000,
      debts: [
        baseDebt({ category: "信貸", principal: 100000, collateralValue: 999 }),
      ],
    });

    const result = calculateStressScenario(snapshot, 30);

    expect(result.after.pledgeMaintenanceStatus).toBe("none");
    expect(result.after.pledgeMaintenanceRatio).toBeNull();
  });

  it("有質押負債但尚未填寫質押股票市值時，情境維持率仍為未設定", () => {
    const snapshot = baseSnapshotInput({
      twStockValue: 1000000,
      debts: [pledge(500000, 0)],
    });

    const result = calculateStressScenario(snapshot, 20);

    expect(result.after.pledgeMaintenanceStatus).toBe("unset");
    expect(result.after.pledgeMaintenanceRatio).toBeNull();
  });

  it("現況淨資產為 0 時，變動百分比為 null，不得除以零", () => {
    const snapshot = baseSnapshotInput({
      twStockValue: 100000,
      debts: [baseDebt({ category: "信貸", principal: 100000 })],
    });

    const result = calculateStressScenario(snapshot, 10);

    expect(result.before.netWorth).toBe(0);
    expect(result.netWorthChangeRate).toBeNull();
    expect(Number.isFinite(result.netWorthChange)).toBe(true);
  });

  it("沒有股票時，情境與現況完全相同", () => {
    const snapshot = baseSnapshotInput({ cashSources: [cash(500000)] });

    const result = calculateStressScenario(snapshot, 30);

    expect(result.netWorthChange).toBe(0);
    expect(result.after.netWorth).toBe(result.before.netWorth);
  });

  it("不會修改傳入的快照（純函式）", () => {
    const debts = [pledge(500000, 800000)];
    const snapshot = baseSnapshotInput({ twStockValue: 1000000, debts });

    calculateStressScenario(snapshot, 30);

    expect(snapshot.twStockValue).toBe(1000000);
    expect(debts[0].collateralValue).toBe(800000);
  });
});

// PRD 5.7a 節：本月償還的本金 = 每月應還款金額 − 當月利息
describe("calculateMonthlyPrincipalRepayment", () => {
  // 第 9 節 #56b
  it("本息平均攤還、利率為 0：月付金額全部是本金", () => {
    const debt = baseDebt({ principal: 1200000, remainingMonths: 120 });

    expect(calculateMonthlyPrincipalRepayment(debt)).toBe(10000);
  });

  it("本息平均攤還、有利率：月付金額扣除當月利息", () => {
    const debt = baseDebt({
      principal: 1000000,
      annualRate: 12,
      remainingMonths: 12,
    });

    // 月利率 1%：當月利息 10,000，PMT 約 88,848.79
    expect(calculateMonthlyPrincipalRepayment(debt)).toBeCloseTo(78848.79, 1);
    expect(calculateMonthlyPrincipalRepayment(debt)).toBeCloseTo(
      calculateMonthlyPayment(debt) - 10000
    );
  });

  // 第 9 節 #56c
  it("只計息不償還本金", () => {
    const debt = baseDebt({
      principal: 1200000,
      annualRate: 2.4,
      remainingMonths: 12,
      repaymentMethod: "interestOnly",
    });

    expect(calculateMonthlyPrincipalRepayment(debt)).toBe(0);
  });

  it("已到期（剩餘期數 ≤ 0）為 0，不會出現負數", () => {
    const debt = baseDebt({
      principal: 500000,
      annualRate: 3,
      remainingMonths: 0,
    });

    expect(calculateMonthlyPrincipalRepayment(debt)).toBe(0);
  });

  it("最後一期償還的本金不超過剩餘本金", () => {
    const debt = baseDebt({
      principal: 10000,
      annualRate: 5,
      remainingMonths: 1,
    });

    expect(calculateMonthlyPrincipalRepayment(debt)).toBeCloseTo(10000);
    expect(calculateMonthlyPrincipalRepayment(debt)).toBeLessThanOrEqual(10000);
  });

  it("多筆負債加總，只計息的不計入", () => {
    const debts = [
      baseDebt({ id: "a", principal: 1200000, remainingMonths: 120 }),
      baseDebt({ id: "b", principal: 600000, remainingMonths: 60 }),
      baseDebt({
        id: "c",
        principal: 1200000,
        annualRate: 2.4,
        remainingMonths: 12,
        repaymentMethod: "interestOnly",
      }),
    ];

    expect(calculateTotalMonthlyPrincipalRepayment(debts)).toBe(20000);
    expect(calculateTotalMonthlyPrincipalRepayment([])).toBe(0);
  });
});

// PRD 5.7a 節：以固定的每月淨資產增加額線性推算還需幾個月
describe("calculateGoalEta", () => {
  // 第 9 節 #56a
  it("缺口 ÷ 每月增加額", () => {
    expect(calculateGoalEta(4000000, 10000000, 60000)).toEqual({
      status: "ok",
      monthlyPace: 60000,
      months: 100,
    });
  });

  // 第 9 節 #56d
  it("無條件進位為整數月；剛好整除時不多加一個月", () => {
    expect(calculateGoalEta(0, 1000000, 300000).months).toBe(4);
    expect(calculateGoalEta(0, 600000, 60000).months).toBe(10);
    expect(calculateGoalEta(999999, 1000000, 60000).months).toBe(1);
  });

  it("淨資產為負數時，缺口從負數算起", () => {
    expect(calculateGoalEta(-1000000, 1000000, 100000).months).toBe(20);
  });

  // 第 9 節 #56k
  it("未設定目標（0 或負數）回傳 unset", () => {
    expect(calculateGoalEta(100, 0, 60000).status).toBe("unset");
    expect(calculateGoalEta(100, -5, 60000).status).toBe("unset");
  });

  // 第 9 節 #56k
  it("淨資產達到或超過目標回傳 achieved", () => {
    expect(calculateGoalEta(10000000, 10000000, 60000)).toEqual({
      status: "achieved",
      monthlyPace: 60000,
      months: null,
    });
    expect(calculateGoalEta(12000000, 10000000, -100).status).toBe("achieved");
  });

  // 第 9 節 #56i
  it("沒有每月增加額（null）回傳 no-data", () => {
    expect(calculateGoalEta(4000000, 10000000, null)).toEqual({
      status: "no-data",
      monthlyPace: null,
      months: null,
    });
  });

  // 第 9 節 #56e
  it("每月增加額為 0 或負數回傳 not-growing，並保留該增加額", () => {
    expect(calculateGoalEta(4000000, 10000000, 0)).toEqual({
      status: "not-growing",
      monthlyPace: 0,
      months: null,
    });
    expect(calculateGoalEta(4000000, 10000000, -5000)).toEqual({
      status: "not-growing",
      monthlyPace: -5000,
      months: null,
    });
  });

  // 第 9 節 #56f
  it("超過 100 年回傳 too-far；剛好 100 年仍可估算", () => {
    expect(GOAL_ETA_MAX_MONTHS).toBe(1200);
    expect(calculateGoalEta(0, 10000000, 1000)).toEqual({
      status: "too-far",
      monthlyPace: 1000,
      months: null,
    });
    expect(calculateGoalEta(0, 1200000, 1000)).toMatchObject({
      status: "ok",
      months: 1200,
    });
    expect(calculateGoalEta(0, 1200001, 1000).status).toBe("too-far");
  });
});

describe("目標達成時間預估：歷史速度與整合", () => {
  /** 淨資產等於 cash 的快照（可另外指定負債）。 */
  function snapshotOn(
    date: string,
    cash: number,
    debts: Debt[] = []
  ): Snapshot {
    return {
      ...createEmptySnapshot(date),
      cashSources: [{ id: "c", name: "銀行", amount: cash, restricted: false }],
      debts,
    };
  }

  const DAYS_PER_MONTH = 365.25 / 12;

  describe("calculateHistoricalMonthlyPace", () => {
    // 第 9 節 #56i
    it("沒有快照、只有 1 筆、或相隔不足 30 天時回傳 null", () => {
      expect(calculateHistoricalMonthlyPace([])).toBeNull();
      expect(
        calculateHistoricalMonthlyPace([snapshotOn("2026-10-01", 100)])
      ).toBeNull();
      expect(
        calculateHistoricalMonthlyPace([
          snapshotOn("2026-09-02", 100),
          snapshotOn("2026-10-01", 200),
        ])
      ).toBeNull();
    });

    it("剛好相隔 30 天即可估算", () => {
      const result = calculateHistoricalMonthlyPace([
        snapshotOn("2026-09-01", 100000),
        snapshotOn("2026-10-01", 130000),
      ]);

      expect(result?.fromDate).toBe("2026-09-01");
      expect(result?.monthlyPace).toBeCloseTo((30000 / 30) * DAYS_PER_MONTH);
    });

    // 第 9 節 #56g
    it("淨資產差 ÷ 相隔天數 × 平均每月天數", () => {
      const result = calculateHistoricalMonthlyPace([
        snapshotOn("2025-10-01", 3000000),
        snapshotOn("2026-10-01", 3600000),
      ]);

      expect(result).toEqual({
        monthlyPace: expect.closeTo(50034.25, 1),
        fromDate: "2025-10-01",
        toDate: "2026-10-01",
      });
    });

    // 第 9 節 #56h
    it("起點取 365 天內、距終點至少 30 天者中最早的一筆", () => {
      const result = calculateHistoricalMonthlyPace([
        snapshotOn("2024-01-01", 1),
        snapshotOn("2025-11-01", 2),
        snapshotOn("2026-06-01", 3),
        snapshotOn("2026-09-20", 4),
        snapshotOn("2026-10-01", 5),
      ]);

      expect(result?.fromDate).toBe("2025-11-01");
      expect(result?.toDate).toBe("2026-10-01");
    });

    it("剛好 365 天前的快照在回看範圍內，366 天前的不採用", () => {
      const result = calculateHistoricalMonthlyPace([
        snapshotOn("2025-09-30", 1),
        snapshotOn("2025-10-01", 2),
        snapshotOn("2026-10-01", 3),
      ]);

      expect(result?.fromDate).toBe("2025-10-01");
    });

    // 第 9 節 #56j
    it("365 天內沒有可用起點時，改取 365 天以前最接近的一筆，以實際天數換算", () => {
      const result = calculateHistoricalMonthlyPace([
        snapshotOn("2023-01-01", 0),
        snapshotOn("2024-01-01", 1000000),
        snapshotOn("2026-09-25", 1900000),
        snapshotOn("2026-10-01", 2004000),
      ]);

      expect(result?.fromDate).toBe("2024-01-01");
      // 2024-01-01 → 2026-10-01 相隔 1,004 天
      expect(result?.monthlyPace).toBeCloseTo(
        (1004000 / 1004) * DAYS_PER_MONTH
      );
    });

    it("與傳入順序無關，且不改動傳入的陣列", () => {
      const snapshots = [
        snapshotOn("2026-10-01", 3600000),
        snapshotOn("2025-10-01", 3000000),
      ];

      const result = calculateHistoricalMonthlyPace(snapshots);

      expect(result?.fromDate).toBe("2025-10-01");
      expect(snapshots.map((s) => s.date)).toEqual([
        "2026-10-01",
        "2025-10-01",
      ]);
    });

    it("淨資產減少時每月增加額為負數", () => {
      const result = calculateHistoricalMonthlyPace([
        snapshotOn("2026-04-01", 500000),
        snapshotOn("2026-10-01", 200000),
      ]);

      expect(result?.monthlyPace).toBeLessThan(0);
    });

    it("各筆快照的淨資產以該筆自己的欄位計算（含負債）", () => {
      const result = calculateHistoricalMonthlyPace([
        snapshotOn("2026-09-01", 1000000, [baseDebt({ principal: 400000 })]),
        snapshotOn("2026-10-01", 1000000, [baseDebt({ principal: 370000 })]),
      ]);

      // 現金不變、負債減少 30,000 → 淨資產增加 30,000
      expect(result?.monthlyPace).toBeCloseTo((30000 / 30) * DAYS_PER_MONTH);
    });
  });

  describe("calculateGoalEstimates", () => {
    function draftWith(overrides: Partial<Snapshot> = {}): Snapshot {
      return {
        ...snapshotOn("2026-10-03", 4000000),
        incomeSources: [{ id: "i", name: "薪資", amount: 100000 }],
        monthlyExpense: 40000,
        targetNetWorth: 10000000,
        ...overrides,
      };
    }

    // 第 9 節 #56a
    it("依目前收支：無負債時每月增加額等於現金流", () => {
      const result = calculateGoalEstimates(draftWith(), []);

      expect(result.baseDate).toBe("2026-10-03");
      expect(result.budget).toEqual({
        status: "ok",
        monthlyPace: 60000,
        months: 100,
        cashFlow: 60000,
        principalRepayment: 0,
      });
    });

    // 第 9 節 #56b
    it("依目前收支：償還的本金要加回每月增加額", () => {
      const result = calculateGoalEstimates(
        draftWith({
          debts: [baseDebt({ principal: 1200000, remainingMonths: 120 })],
        }),
        []
      );

      // 現金流 100,000 − 40,000 − 10,000 = 50,000；本金 10,000 加回後仍為 60,000
      expect(result.budget).toEqual({
        status: "ok",
        monthlyPace: 60000,
        months: 120,
        cashFlow: 50000,
        principalRepayment: 10000,
      });
    });

    // 第 9 節 #56c
    it("依目前收支：只計息負債的利息是支出，不加回", () => {
      const result = calculateGoalEstimates(
        draftWith({
          debts: [
            baseDebt({
              principal: 1200000,
              annualRate: 2.4,
              remainingMonths: 12,
              repaymentMethod: "interestOnly",
            }),
          ],
        }),
        []
      );

      expect(result.budget.principalRepayment).toBe(0);
      expect(result.budget.cashFlow).toBeCloseTo(57600);
      expect(result.budget.monthlyPace).toBeCloseTo(57600);
    });

    // 第 9 節 #56e
    it("依目前收支：支出大於收入時為 not-growing", () => {
      const result = calculateGoalEstimates(
        draftWith({ monthlyExpense: 150000 }),
        []
      );

      expect(result.budget).toMatchObject({
        status: "not-growing",
        monthlyPace: -50000,
        months: null,
      });
    });

    // 第 9 節 #56i
    it("依歷史變化：沒有可用的已存檔快照時為 no-data，不影響依目前收支", () => {
      const result = calculateGoalEstimates(draftWith(), [
        snapshotOn("2026-10-01", 3900000),
      ]);

      expect(result.history).toEqual({
        status: "no-data",
        monthlyPace: null,
        months: null,
        fromDate: null,
        toDate: null,
      });
      expect(result.budget.status).toBe("ok");
    });

    // 第 9 節 #56g
    it("依歷史變化：以已存檔快照的速度推算表單淨資產到目標的時間", () => {
      const result = calculateGoalEstimates(
        draftWith({
          cashSources: [
            { id: "c", name: "銀行", amount: 3600000, restricted: false },
          ],
          targetNetWorth: 6000000,
        }),
        [snapshotOn("2025-10-01", 3000000), snapshotOn("2026-10-01", 3600000)]
      );

      expect(result.history).toEqual({
        status: "ok",
        monthlyPace: expect.closeTo(50034.25, 1),
        months: 48,
        fromDate: "2025-10-01",
        toDate: "2026-10-01",
      });
    });

    // 第 9 節 #56l
    it("依歷史變化只看已存檔快照：修改表單的收支不會改變其每月增加額", () => {
      const saved = [
        snapshotOn("2025-10-01", 3000000),
        snapshotOn("2026-10-01", 3600000),
      ];

      const before = calculateGoalEstimates(draftWith(), saved);
      const after = calculateGoalEstimates(
        draftWith({ monthlyExpense: 90000 }),
        saved
      );

      expect(after.budget.monthlyPace).not.toBe(before.budget.monthlyPace);
      expect(after.history.monthlyPace).toBe(before.history.monthlyPace);
      expect(after.history.fromDate).toBe("2025-10-01");
    });

    // 第 9 節 #56k
    it("未設定目標或已達成時，兩種估算皆回傳對應狀態", () => {
      const unset = calculateGoalEstimates(
        draftWith({ targetNetWorth: 0 }),
        []
      );
      expect(unset.budget.status).toBe("unset");
      expect(unset.history.status).toBe("unset");

      const achieved = calculateGoalEstimates(
        draftWith({ targetNetWorth: 4000000 }),
        []
      );
      expect(achieved.budget.status).toBe("achieved");
      expect(achieved.history.status).toBe("achieved");
    });

    it("預計達成月份的起算日為表單的日期（修正模式下為被修正的那一天）", () => {
      const result = calculateGoalEstimates(
        { ...draftWith(), date: "2026-01-15" },
        []
      );

      expect(result.baseDate).toBe("2026-01-15");
    });
  });
});

// PRD 第 9 節 #60a 的資料：現金 100 萬＋台股 300 萬＋不動產 1,200 萬；房貸 600 萬＋信貸 40 萬＋質押 120 萬
function leveragedHomeownerInput(
  overrides: Partial<Parameters<typeof calculateMetrics>[0]> = {}
) {
  return baseSnapshotInput({
    cashSources: [
      { id: "1", name: "現金", amount: 1000000, restricted: false },
    ],
    twStockValue: 3000000,
    realEstateValue: 12000000,
    debts: [
      baseDebt({
        id: "mortgage",
        category: "房貸",
        principal: 6000000,
        annualRate: 2.4,
        remainingMonths: 240,
      }),
      baseDebt({ id: "credit", category: "信貸", principal: 400000 }),
      baseDebt({
        id: "pledge",
        category: "質押",
        principal: 1200000,
        repaymentMethod: "interestOnly",
      }),
    ],
    ...overrides,
  });
}

describe("金融負債比（PRD 5.1a 節）", () => {
  it("sumFinancialDebtPrincipal 只加總房貸以外的負債（信貸、質押、其他）", () => {
    expect(
      sumFinancialDebtPrincipal([
        baseDebt({ category: "房貸", principal: 6000000 }),
        baseDebt({ category: "信貸", principal: 400000 }),
        baseDebt({ category: "質押", principal: 1200000 }),
        baseDebt({ category: "其他", principal: 50000 }),
      ])
    ).toBe(1650000);
    expect(sumFinancialDebtPrincipal([])).toBe(0);
  });

  it("calculateFinancialDebtRatio：金融資產 ≤ 0 時回傳 null，不出現 NaN 或 Infinity", () => {
    expect(calculateFinancialDebtRatio(1600000, 4000000)).toBeCloseTo(40);
    expect(calculateFinancialDebtRatio(0, 4000000)).toBe(0);
    expect(calculateFinancialDebtRatio(100000, 0)).toBeNull();
    expect(calculateFinancialDebtRatio(0, 0)).toBeNull();
    expect(calculateFinancialDebtRatio(100000, -50000)).toBeNull();
  });

  // PRD 第 9 節 #60a
  it("有不動產與房貸時，金融負債比不含兩者，負債比維持原算法", () => {
    const result = calculateMetrics(leveragedHomeownerInput());

    expect(result.debtRatio).toBeCloseTo(47.5);
    expect(result.debtRatioStatus).toBe("elevated");
    expect(result.financialLiabilities).toBe(1600000);
    expect(result.financialDebtRatio).toBeCloseTo(40);
    expect(result.financialDebtRatioStatus).toBe("elevated");
    expect(hasSeparateFinancialDebtRatio(result)).toBe(true);
  });

  it("不動產稀釋下負債比健康，金融負債比仍可判為高風險", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "現金", amount: 500000, restricted: false },
        ],
        twStockValue: 2500000,
        realEstateValue: 17000000,
        debts: [
          baseDebt({ id: "m", category: "房貸", principal: 5000000 }),
          baseDebt({ id: "p", category: "質押", principal: 2000000 }),
        ],
      })
    );

    expect(result.debtRatio).toBeCloseTo(35);
    expect(result.debtRatioStatus).toBe("healthy");
    expect(result.financialDebtRatio).toBeCloseTo(66.67, 1);
    expect(result.financialDebtRatioStatus).toBe("high-risk");
  });

  // PRD 第 9 節 #60b
  it("沒有不動產也沒有房貸時，與負債比相同且不需另外顯示", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "現金", amount: 1000000, restricted: false },
        ],
        debts: [baseDebt({ category: "信貸", principal: 300000 })],
      })
    );

    expect(result.financialDebtRatio).toBe(result.debtRatio);
    expect(result.financialDebtRatioStatus).toBe(result.debtRatioStatus);
    expect(hasSeparateFinancialDebtRatio(result)).toBe(false);
  });

  // PRD 第 9 節 #60c
  it("金融資產為 0 時金融負債比為 null，不需另外顯示，負債比照常計算", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        realEstateValue: 10000000,
        debts: [
          baseDebt({ id: "m", category: "房貸", principal: 5000000 }),
          baseDebt({ id: "c", category: "信貸", principal: 100000 }),
        ],
      })
    );

    expect(result.financialDebtRatio).toBeNull();
    expect(result.financialDebtRatioStatus).toBeNull();
    expect(hasSeparateFinancialDebtRatio(result)).toBe(false);
    expect(result.debtRatio).toBeCloseTo(51);
  });

  // PRD 第 9 節 #60d
  it("只有房貸時，金融負債比為 0%（完美無債），負債比不變", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "現金", amount: 1000000, restricted: false },
        ],
        realEstateValue: 10000000,
        debts: [baseDebt({ category: "房貸", principal: 6000000 })],
      })
    );

    expect(result.financialDebtRatio).toBe(0);
    expect(result.financialDebtRatioStatus).toBe("debt-free");
    expect(result.debtRatio).toBeCloseTo(54.545, 2);
    expect(hasSeparateFinancialDebtRatio(result)).toBe(true);
  });

  it("有房貸但未填不動產市值時，仍視為計算基礎不同", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "現金", amount: 1000000, restricted: false },
        ],
        debts: [baseDebt({ category: "房貸", principal: 600000 })],
      })
    );

    expect(result.debtRatio).toBeCloseTo(60);
    expect(result.financialDebtRatio).toBe(0);
    expect(hasSeparateFinancialDebtRatio(result)).toBe(true);
  });

  it("壓力測試情境下，金融負債比隨股票下跌上升", () => {
    const { before, after } = calculateStressScenario(
      leveragedHomeownerInput(),
      30
    );

    expect(before.financialDebtRatio).toBeCloseTo(40);
    // 金融資產 100 萬＋300 萬 × 0.7 = 310 萬
    expect(after.financialDebtRatio).toBeCloseTo((1600000 / 3100000) * 100);
  });
});

describe("含償還本金的儲蓄率（PRD 5.6 節）", () => {
  // PRD 第 9 節 #60e
  it("把本月償還的本金加回分子，現金基礎的儲蓄率與燈號不變", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        debts: [
          baseDebt({
            category: "房貸",
            principal: 6000000,
            annualRate: 2.4,
            remainingMonths: 240,
          }),
        ],
        incomeSources: [{ id: "i1", name: "薪資", amount: 100000 }],
        monthlyExpense: 40000,
      })
    );

    // 月付 ≈ 31,503、當月利息 12,000 → 償還本金 ≈ 19,503
    expect(result.totalMonthlyDebtPayment).toBeCloseTo(31502.6, 0);
    expect(result.monthlyPrincipalRepayment).toBeCloseTo(19502.6, 0);
    expect(result.savingsRate).toBeCloseTo(28.5, 1);
    expect(result.savingsRateStatus).toBe("high");
    // 收入 − 支出 − 利息 = 100,000 − 40,000 − 12,000 = 48,000
    expect(result.savingsRateWithPrincipal).toBeCloseTo(48);
  });

  // PRD 第 9 節 #60f
  it("沒有負債或只有只計息負債時，本月償還本金為 0，兩個儲蓄率相同", () => {
    const noDebt = calculateMetrics(
      baseSnapshotInput({
        incomeSources: [{ id: "i1", name: "薪資", amount: 60000 }],
        monthlyExpense: 42000,
      })
    );
    expect(noDebt.monthlyPrincipalRepayment).toBe(0);
    expect(noDebt.savingsRateWithPrincipal).toBe(noDebt.savingsRate);

    const interestOnly = calculateMetrics(
      baseSnapshotInput({
        debts: [
          baseDebt({
            category: "質押",
            principal: 1200000,
            annualRate: 2.4,
            remainingMonths: 12,
            repaymentMethod: "interestOnly",
          }),
        ],
        incomeSources: [{ id: "i1", name: "薪資", amount: 60000 }],
        monthlyExpense: 42000,
      })
    );
    expect(interestOnly.monthlyPrincipalRepayment).toBe(0);
    expect(interestOnly.savingsRateWithPrincipal).toBe(
      interestOnly.savingsRate
    );
  });

  it("總收入為 0 時強制為 0%，不得除以零", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        debts: [
          baseDebt({ principal: 120000, annualRate: 0, remainingMonths: 12 }),
        ],
      })
    );

    expect(result.monthlyPrincipalRepayment).toBeCloseTo(10000);
    expect(result.savingsRateWithPrincipal).toBe(0);
  });

  it("與目標達成時間預估「依目前收支」使用同一個償還本金", () => {
    const draft: Snapshot = {
      ...createEmptySnapshot("2026-10-06"),
      ...leveragedHomeownerInput({
        incomeSources: [{ id: "i1", name: "薪資", amount: 100000 }],
        monthlyExpense: 40000,
        targetNetWorth: 20000000,
      }),
    };

    const metrics = calculateMetrics(draft);
    const { budget } = calculateGoalEstimates(draft, []);

    expect(budget.principalRepayment).toBe(metrics.monthlyPrincipalRepayment);
    expect(budget.principalRepayment).toBe(
      calculateTotalMonthlyPrincipalRepayment(draft.debts)
    );
    expect(budget.monthlyPace).toBeCloseTo(
      metrics.cashFlow + metrics.monthlyPrincipalRepayment
    );
  });
});

describe("可投資淨資產進度（PRD 5.7 節）", () => {
  // PRD 第 9 節 #60g
  it("可投資淨資產 = 金融資產 − 金融負債，淨資產進度維持原算法", () => {
    const result = calculateMetrics(
      leveragedHomeownerInput({ targetNetWorth: 20000000 })
    );

    expect(result.netWorth).toBe(8400000);
    expect(result.goalProgress).toBeCloseTo(42);
    expect(result.investableNetWorth).toBe(2400000);
    expect(result.investableGoalProgress).toBeCloseTo(12);
  });

  // PRD 第 9 節 #60h
  it("沒有不動產也沒有房貸時，與淨資產及其進度完全相同", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "現金", amount: 1000000, restricted: false },
        ],
        debts: [baseDebt({ category: "信貸", principal: 300000 })],
        targetNetWorth: 2000000,
      })
    );

    expect(result.investableNetWorth).toBe(result.netWorth);
    expect(result.investableGoalProgress).toBe(result.goalProgress);
    expect(result.goalProgress).toBeCloseTo(35);
  });

  // PRD 第 9 節 #60i
  it("目標未設定時，可投資淨資產進度為 null", () => {
    const result = calculateMetrics(leveragedHomeownerInput());

    expect(result.investableNetWorth).toBe(2400000);
    expect(result.investableGoalProgress).toBeNull();
  });

  it("金融負債大於金融資產時，可投資淨資產與進度為負數", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "現金", amount: 500000, restricted: false },
        ],
        realEstateValue: 10000000,
        debts: [
          baseDebt({ id: "m", category: "房貸", principal: 4000000 }),
          baseDebt({ id: "c", category: "信貸", principal: 1000000 }),
        ],
        targetNetWorth: 10000000,
      })
    );

    expect(result.investableNetWorth).toBe(-500000);
    expect(result.investableGoalProgress).toBeCloseTo(-5);
    expect(result.goalProgress).toBeCloseTo(55);
  });

  it("不可動用現金計入可投資淨資產（屬於金融資產）", () => {
    const result = calculateMetrics(
      baseSnapshotInput({
        cashSources: [
          { id: "1", name: "現金", amount: 600000, restricted: false },
          { id: "2", name: "期貨保證金", amount: 400000, restricted: true },
        ],
        realEstateValue: 5000000,
        targetNetWorth: 10000000,
      })
    );

    expect(result.investableNetWorth).toBe(1000000);
    expect(result.investableGoalProgress).toBeCloseTo(10);
  });
});
