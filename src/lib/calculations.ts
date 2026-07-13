import type {
  CalculatedMetrics,
  CashSource,
  Debt,
  DebtCategory,
  DebtRatioStatus,
  IncomeSource,
  RepaymentMethod,
  Snapshot,
  StockCurrency,
} from "@/types/schema";

/** 非數字或空值一律視為 0（PRD 4.2 輸入防呆規則） */
export function toSafeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function sumCashSources(cashSources: CashSource[]): number {
  return cashSources.reduce(
    (sum, source) => sum + toSafeNumber(source.amount),
    0
  );
}

export function sumIncomeSources(incomeSources: IncomeSource[]): number {
  return incomeSources.reduce(
    (sum, source) => sum + toSafeNumber(source.amount),
    0
  );
}

/** 新增負債時依類別帶入的常見攤還方式預設值，使用者可自行覆寫（PRD 4.2、5.2 節）。 */
export const DEFAULT_REPAYMENT_METHOD_BY_CATEGORY: Record<
  DebtCategory,
  RepaymentMethod
> = {
  信貸: "amortizing",
  質押: "interestOnly",
  房貸: "amortizing",
  其他: "amortizing",
};

/**
 * 單筆負債的每月應還款金額（PRD 5.2 節）。
 * 本息平均攤還採標準 PMT 年金公式；只計息簡化為「年利率 ÷ 12」，不採實際天數計息。
 * 剩餘還款期數 ≤ 0 時一律視為 0，避免除以零或 NaN/Infinity。
 */
export function calculateMonthlyPayment(debt: Debt): number {
  const principal = toSafeNumber(debt.principal);
  const annualRate = toSafeNumber(debt.annualRate);
  const remainingMonths = toSafeNumber(debt.remainingMonths);

  if (remainingMonths <= 0) return 0;

  const monthlyRate = annualRate / 100 / 12;

  if (debt.repaymentMethod === "interestOnly") {
    return principal * monthlyRate;
  }

  if (monthlyRate === 0) return principal / remainingMonths;

  const factor = Math.pow(1 + monthlyRate, remainingMonths);
  return (principal * (monthlyRate * factor)) / (factor - 1);
}

export function calculateTotalMonthlyDebtPayment(debts: Debt[]): number {
  return debts.reduce((sum, debt) => sum + calculateMonthlyPayment(debt), 0);
}

export function sumDebtPrincipal(debts: Debt[]): number {
  return debts.reduce((sum, debt) => sum + toSafeNumber(debt.principal), 0);
}

/**
 * 美股市值計價幣別為 USD 時，需乘上匯率換算成台幣；
 * 若使用者選擇直接以台幣等值金額填入（TWD），則不再重複換算。
 */
export function calculateTotalStockValue(
  twStockValue: number,
  usStockValue: number,
  exchangeRate: number,
  usStockCurrency: StockCurrency = "USD"
): number {
  const usValueInTwd =
    usStockCurrency === "TWD"
      ? toSafeNumber(usStockValue)
      : toSafeNumber(usStockValue) * toSafeNumber(exchangeRate);
  return toSafeNumber(twStockValue) + usValueInTwd;
}

export function calculateDebtRatioStatus(ratio: number): DebtRatioStatus {
  if (ratio === 0) return "debt-free";
  if (ratio < 40) return "healthy";
  if (ratio <= 60) return "elevated";
  return "high-risk";
}

export const DEBT_RATIO_STATUS_LABEL: Record<DebtRatioStatus, string> = {
  "debt-free": "完美無債",
  healthy: "財務健康（安全範圍）",
  elevated: "負債偏高（需注意調控）",
  "high-risk": "財務高風險（請儘速理債）",
};

export function calculateMetrics(
  snapshot: Pick<
    Snapshot,
    | "cashSources"
    | "twStockValue"
    | "usStockValue"
    | "usStockCurrency"
    | "exchangeRate"
    | "debts"
    | "incomeSources"
    | "monthlyExpense"
  >
): CalculatedMetrics {
  const totalCash = sumCashSources(snapshot.cashSources);
  const totalStockValue = calculateTotalStockValue(
    snapshot.twStockValue,
    snapshot.usStockValue,
    snapshot.exchangeRate,
    snapshot.usStockCurrency
  );
  const totalAssets = totalCash + totalStockValue;
  const totalLiabilities = sumDebtPrincipal(snapshot.debts);
  const netWorth = totalAssets - totalLiabilities;
  // 總資產為 0 時負債比預設為 0%，避免除以零（PRD 第 5 節）
  const debtRatio =
    totalAssets === 0 ? 0 : (totalLiabilities / totalAssets) * 100;
  // 總資產為 0 時現金比例同樣預設為 0%，避免除以零
  const cashRatio = totalAssets === 0 ? 0 : (totalCash / totalAssets) * 100;
  const totalMonthlyDebtPayment = calculateTotalMonthlyDebtPayment(
    snapshot.debts
  );
  const totalIncome = sumIncomeSources(snapshot.incomeSources);
  // 現金流 = 總收入 − 本月支出 − 本月應還款總額（PRD 5.3 節）
  const cashFlow =
    totalIncome -
    toSafeNumber(snapshot.monthlyExpense) -
    totalMonthlyDebtPayment;

  return {
    totalCash,
    totalStockValue,
    totalAssets,
    totalLiabilities,
    netWorth,
    debtRatio,
    debtRatioStatus: calculateDebtRatioStatus(debtRatio),
    cashRatio,
    totalMonthlyDebtPayment,
    totalIncome,
    cashFlow,
  };
}
