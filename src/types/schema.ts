export const CURRENT_SCHEMA_VERSION = 3;

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
  month: string; // "YYYY-MM"
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
}

export interface FinanceData {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  snapshots: Snapshot[];
}

export type DebtRatioStatus =
  "debt-free" | "healthy" | "elevated" | "high-risk";

export interface CalculatedMetrics {
  totalCash: number;
  totalStockValue: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  debtRatio: number;
  debtRatioStatus: DebtRatioStatus;
  cashRatio: number;
  /** 負債清單所有項目「每月應還款金額」加總（PRD 5.2 節）。 */
  totalMonthlyDebtPayment: number;
  /** 多筆每月收入加總。 */
  totalIncome: number;
  /** 現金流 = 總收入 − 本月支出 − 本月應還款總額（PRD 5.3 節，不再手動輸入）。 */
  cashFlow: number;
}

export function createEmptySnapshot(month: string): Snapshot {
  return {
    month,
    updatedAt: new Date().toISOString(),
    cashSources: [],
    twStockValue: 0,
    usStockValue: 0,
    usStockCurrency: "USD",
    exchangeRate: 0,
    debts: [],
    incomeSources: [],
    monthlyExpense: 0,
  };
}
