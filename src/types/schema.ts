export const CURRENT_SCHEMA_VERSION = 5;

export interface CashSource {
  id: string;
  name: string;
  amount: number;
}

/** 美股市值的計價幣別：USD 需乘上匯率換算成台幣，TWD 則直接採用使用者輸入的台幣等值金額。 */
export type StockCurrency = "TWD" | "USD";

/** 負債類別：純分類標籤，不直接決定攤還方式（見 repaymentMethod 與 DEFAULT_REPAYMENT_METHOD_BY_CATEGORY）。 */
export type DebtCategory = "信貸" | "質押" | "房貸" | "其他";

/** 本息平均攤還（每月固定金額）或只計息（不還本金）（PRD 5.2 節）。 */
export type RepaymentMethod = "amortizing" | "interestOnly";

export interface Debt {
  id: string;
  name: string;
  category: DebtCategory;
  /** 剩餘本金，使用者每月手動維護，不隨時間自動遞減。 */
  principal: number;
  /** 年利率，以百分比數字儲存（例如 2.1 代表 2.1%）。 */
  annualRate: number;
  /** 剩餘還款期數（月），使用者每月手動遞減。 */
  remainingMonths: number;
  repaymentMethod: RepaymentMethod;
}

export interface IncomeSource {
  id: string;
  name: string;
  amount: number;
}

export interface Snapshot {
  date: string; // "YYYY-MM-DD"
  updatedAt: string; // ISO 8601
  cashSources: CashSource[];
  twStockValue: number;
  usStockValue: number;
  usStockCurrency: StockCurrency;
  exchangeRate: number;
  debts: Debt[];
  incomeSources: IncomeSource[];
  /** 本月支出，不含負債清單的每月應還款金額（PRD 5.3 節現金流公式）。 */
  monthlyExpense: number;
  /** 目標淨資產，選填，0 代表尚未設定（PRD 4.2、5.7 節 FIRE／淨資產目標進度）。 */
  targetNetWorth: number;
}

export interface FinanceData {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  snapshots: Snapshot[];
}

export type DebtRatioStatus =
  "debt-free" | "healthy" | "elevated" | "high-risk";

/** 緊急預備金月數健康度（PRD 5.5 節）："no-need" 代表分母為 0（無需求），不屬於風險分級。 */
export type EmergencyFundStatus =
  "no-need" | "insufficient" | "basic" | "sufficient";

/** 儲蓄率健康度（PRD 5.6 節）。 */
export type SavingsRateStatus = "negative" | "low" | "healthy" | "high";

export interface CalculatedMetrics {
  totalCash: number;
  totalStockValue: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  debtRatio: number;
  debtRatioStatus: DebtRatioStatus;
  cashRatio: number;
  /** 台股市值（已轉為安全數字）。供資產配置公式說明顯示實際數值使用（PRD 第 5 節）。 */
  twStockValue: number;
  /** 美股市值已換算為台幣後的金額。供資產配置公式說明顯示實際數值使用（PRD 第 5 節）。 */
  usStockValueInTwd: number;
  /** 台股市值佔總資產比例（PRD 第 5 節資產配置比例公式）。 */
  twStockRatio: number;
  /** 美股市值（已換算台幣）佔總資產比例（PRD 第 5 節資產配置比例公式）。 */
  usStockRatio: number;
  /** 負債清單所有項目「每月應還款金額」加總（PRD 5.2 節）。 */
  totalMonthlyDebtPayment: number;
  /** 多筆每月收入加總。 */
  totalIncome: number;
  /** 現金流 = 總收入 − 本月支出 − 本月應還款總額（PRD 5.3 節，不再手動輸入）。 */
  cashFlow: number;
  /** 緊急預備金月數 = 總流動現金 ÷（本月支出 + 本月應還款總額）；分母為 0 時為 null，代表「無需求」（PRD 5.5 節）。 */
  emergencyFundMonths: number | null;
  emergencyFundStatus: EmergencyFundStatus;
  /** 儲蓄率 = 現金流 ÷ 總收入 × 100（PRD 5.6 節）。 */
  savingsRate: number;
  savingsRateStatus: SavingsRateStatus;
  /** FIRE／淨資產目標進度 = 淨資產 ÷ 目標淨資產 × 100；目標為 0（未設定）時為 null（PRD 5.7 節）。 */
  goalProgress: number | null;
}

export function createEmptySnapshot(date: string): Snapshot {
  return {
    date,
    updatedAt: new Date().toISOString(),
    cashSources: [],
    twStockValue: 0,
    usStockValue: 0,
    usStockCurrency: "USD",
    exchangeRate: 0,
    debts: [],
    incomeSources: [],
    monthlyExpense: 0,
    targetNetWorth: 0,
  };
}
