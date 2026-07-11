export const CURRENT_SCHEMA_VERSION = 2;

export interface CashSource {
  id: string;
  name: string;
  amount: number;
}

/** 美股市值的計價幣別：USD 需乘上匯率換算成台幣，TWD 則直接採用使用者輸入的台幣等值金額。 */
export type StockCurrency = "TWD" | "USD";

export interface Snapshot {
  month: string; // "YYYY-MM"
  updatedAt: string; // ISO 8601
  cashSources: CashSource[];
  twStockValue: number;
  usStockValue: number;
  usStockCurrency: StockCurrency;
  exchangeRate: number;
  loan: number;
  otherDebt: number;
  cashFlow: number;
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
    loan: 0,
    otherDebt: 0,
    cashFlow: 0,
  };
}
