import type {
  CalculatedMetrics,
  CashSource,
  Debt,
  DebtCategory,
  DebtRatioStatus,
  EmergencyFundStatus,
  IncomeSource,
  RepaymentMethod,
  SavingsRateStatus,
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

/**
 * 依經過的月數，將單筆負債的剩餘本金／剩餘期數往前推進，用於「今日草稿自動預填」估算負債的最新狀態
 * （PRD 4.2 節「負債剩餘本金／期數自動估算」），使用者仍可在草稿中手動覆寫。
 * 本息平均攤還：以目前狀態算出的固定月付金額（PMT）逐月扣除利息後推進本金；
 * 只計息：本金不隨時間攤還，只遞減期數（期滿代表到期須一次還清，非自動清償，本金維持不變）。
 * monthsElapsed ≤ 0 或負債已到期（remainingMonths ≤ 0）時不做任何變動。
 */
export function advanceDebtByMonths(debt: Debt, monthsElapsed: number): Debt {
  const remainingMonths = toSafeNumber(debt.remainingMonths);
  if (monthsElapsed <= 0 || remainingMonths <= 0) return debt;

  const newRemainingMonths = Math.max(0, remainingMonths - monthsElapsed);

  if (debt.repaymentMethod === "interestOnly") {
    return { ...debt, remainingMonths: newRemainingMonths };
  }

  const monthlyRate = toSafeNumber(debt.annualRate) / 100 / 12;
  const payment = calculateMonthlyPayment(debt);
  const steps = Math.min(monthsElapsed, remainingMonths);

  let balance = toSafeNumber(debt.principal);
  for (let i = 0; i < steps; i++) {
    balance -= payment - balance * monthlyRate;
  }

  return {
    ...debt,
    principal: newRemainingMonths === 0 ? 0 : Math.max(0, balance),
    remainingMonths: newRemainingMonths,
  };
}

export function advanceDebtsByMonths(
  debts: Debt[],
  monthsElapsed: number
): Debt[] {
  return debts.map((debt) => advanceDebtByMonths(debt, monthsElapsed));
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

/**
 * 緊急預備金月數 = 總流動現金 ÷（本月支出 + 本月應還款總額）（PRD 5.5 節）。
 * 分子僅計入現金，不含股票市值（收入中斷期間賤賣股票風險高，不視為即時可動用資金）。
 * 分母為 0 時回傳 null，代表「無需求」，不套用風險分級。
 */
export function calculateEmergencyFundMonths(
  totalCash: number,
  monthlyExpense: number,
  totalMonthlyDebtPayment: number
): number | null {
  const denominator = toSafeNumber(monthlyExpense) + totalMonthlyDebtPayment;
  if (denominator === 0) return null;
  return totalCash / denominator;
}

export function calculateEmergencyFundStatus(
  months: number | null
): EmergencyFundStatus {
  if (months === null) return "no-need";
  if (months < 3) return "insufficient";
  if (months < 6) return "basic";
  return "sufficient";
}

export const EMERGENCY_FUND_STATUS_LABEL: Record<EmergencyFundStatus, string> =
  {
    "no-need": "無需求",
    insufficient: "預備金不足",
    basic: "基本安全",
    sufficient: "預備充足",
  };

/** 儲蓄率 = 現金流 ÷ 總收入 × 100%，總收入為 0 時強制為 0（PRD 5.6 節）。 */
export function calculateSavingsRate(
  cashFlow: number,
  totalIncome: number
): number {
  if (totalIncome === 0) return 0;
  return (cashFlow / totalIncome) * 100;
}

export function calculateSavingsRateStatus(rate: number): SavingsRateStatus {
  if (rate < 0) return "negative";
  if (rate < 10) return "low";
  if (rate < 20) return "healthy";
  return "high";
}

export const SAVINGS_RATE_STATUS_LABEL: Record<SavingsRateStatus, string> = {
  negative: "入不敷出",
  low: "儲蓄偏低",
  healthy: "儲蓄健康",
  high: "高儲蓄率",
};

/** FIRE 建議目標淨資產＝本月支出 × 12 × 25（4% 提領法則），僅供「使用建議值」按鈕帶入（PRD 5.7 節）。 */
export function calculateSuggestedTargetNetWorth(
  monthlyExpense: number
): number {
  return toSafeNumber(monthlyExpense) * 12 * 25;
}

/**
 * FIRE／淨資產目標進度 = 淨資產 ÷ 目標淨資產 × 100（PRD 5.7 節）。
 * 目標為 0（未設定）時回傳 null。不在此處夾住上下限，封頂/夾底交由 UI 呈現時處理，
 * 讓呼叫端仍能取得未夾住的真實百分比（例如超標時要如實顯示 142% 而非 100%）。
 */
export function calculateGoalProgress(
  netWorth: number,
  targetNetWorth: number
): number | null {
  const target = toSafeNumber(targetNetWorth);
  if (target === 0) return null;
  return (netWorth / target) * 100;
}

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
    | "targetNetWorth"
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
  // 資產配置比例（PRD 第 5 節）：美股佔比以換算後的台幣等值金額（totalStockValue 扣除台股部分）計算
  const twStockValueSafe = toSafeNumber(snapshot.twStockValue);
  const usStockValueInTwd = totalStockValue - twStockValueSafe;
  const twStockRatio =
    totalAssets === 0 ? 0 : (twStockValueSafe / totalAssets) * 100;
  const usStockRatio =
    totalAssets === 0 ? 0 : (usStockValueInTwd / totalAssets) * 100;
  const totalMonthlyDebtPayment = calculateTotalMonthlyDebtPayment(
    snapshot.debts
  );
  const totalIncome = sumIncomeSources(snapshot.incomeSources);
  // 現金流 = 總收入 − 本月支出 − 本月應還款總額（PRD 5.3 節）
  const cashFlow =
    totalIncome -
    toSafeNumber(snapshot.monthlyExpense) -
    totalMonthlyDebtPayment;
  const emergencyFundMonths = calculateEmergencyFundMonths(
    totalCash,
    snapshot.monthlyExpense,
    totalMonthlyDebtPayment
  );
  const savingsRate = calculateSavingsRate(cashFlow, totalIncome);
  const goalProgress = calculateGoalProgress(netWorth, snapshot.targetNetWorth);

  return {
    totalCash,
    totalStockValue,
    totalAssets,
    totalLiabilities,
    netWorth,
    debtRatio,
    debtRatioStatus: calculateDebtRatioStatus(debtRatio),
    cashRatio,
    twStockRatio,
    usStockRatio,
    totalMonthlyDebtPayment,
    totalIncome,
    cashFlow,
    emergencyFundMonths,
    emergencyFundStatus: calculateEmergencyFundStatus(emergencyFundMonths),
    savingsRate,
    savingsRateStatus: calculateSavingsRateStatus(savingsRate),
    goalProgress,
  };
}
