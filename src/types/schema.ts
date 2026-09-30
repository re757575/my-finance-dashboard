export const CURRENT_SCHEMA_VERSION = 7;

export interface CashSource {
  id: string;
  name: string;
  amount: number;
  /**
   * 不可動用（如期貨保證金）：仍計入總資產，但不計入緊急預備金月數與現金比例的分子（PRD 4.2、5.5 節）。
   * 缺少此欄位視為 false（可動用）。
   */
  restricted: boolean;
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
  /** 質押股票市值（新台幣），僅 category 為「質押」時參與整戶維持率計算（PRD 5.8 節）。 */
  collateralValue: number;
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
  /** 不動產市值（新台幣），計入總資產與淨資產，但不計入金融資產（PRD 4.2、5 節）。 */
  realEstateValue: number;
  debts: Debt[];
  incomeSources: IncomeSource[];
  /** 本月支出，不含負債清單的每月應還款金額（PRD 5.3 節現金流公式）。 */
  monthlyExpense: number;
  /** 目標淨資產，選填，0 代表尚未設定（PRD 4.2、5.7 節 FIRE／淨資產目標進度）。 */
  targetNetWorth: number;
  /** 目標現金比例（0-100），選填，0 代表尚未設定；股票目標比例＝100 減此值（PRD 4.2 節「AI 分析提示詞多模式」資產配置再平衡建議）。 */
  targetCashRatio: number;
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

/**
 * 質押整戶維持率健康度（PRD 5.8 節）。"none" 代表無質押負債（不顯示卡片）、
 * "unset" 代表有質押負債但尚未填寫質押股票市值（只顯示引導文字，不分級）。
 */
export type PledgeMaintenanceStatus =
  "none" | "unset" | "safe" | "watch" | "warning" | "margin-call";

export interface CalculatedMetrics {
  totalCash: number;
  totalStockValue: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  debtRatio: number;
  debtRatioStatus: DebtRatioStatus;
  /** 現金比例 = 可動用現金 ÷ 金融資產 × 100（PRD 第 5 節）。 */
  cashRatio: number;
  /** 可動用現金：總現金扣除標記為「不可動用」的來源（PRD 第 5 節）。 */
  liquidCash: number;
  /** 不可動用現金（如期貨保證金）：計入總資產，不計入緊急預備金與現金比例分子。 */
  restrictedCash: number;
  /** 不可動用現金占金融資產比例（PRD 第 5 節）。 */
  restrictedCashRatio: number;
  /** 金融資產 = 總現金 + 股票市值合計，現金比例與資產配置比例的分母（PRD 第 5 節）。 */
  financialAssets: number;
  /** 不動產市值（已轉為安全數字）。 */
  realEstateValue: number;
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
  /** 質押類別負債的剩餘本金合計（PRD 5.8 節）。 */
  pledgePrincipal: number;
  /** 質押類別負債的質押股票市值合計（PRD 5.8 節）。 */
  pledgeCollateralValue: number;
  /** 質押整戶維持率（%）；無質押本金或尚未填寫質押股票市值時為 null（PRD 5.8 節）。 */
  pledgeMaintenanceRatio: number | null;
  pledgeMaintenanceStatus: PledgeMaintenanceStatus;
  /** 擔保品再下跌多少 % 會觸及追繳線；維持率 null 或已低於追繳線時為 null（PRD 5.8 節）。 */
  pledgeDropToMarginCall: number | null;
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
    realEstateValue: 0,
    debts: [],
    incomeSources: [],
    monthlyExpense: 0,
    targetNetWorth: 0,
    targetCashRatio: 0,
  };
}
