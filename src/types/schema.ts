export const CURRENT_SCHEMA_VERSION = 1;

export interface CashSource {
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
    exchangeRate: 0,
    loan: 0,
    otherDebt: 0,
    cashFlow: 0,
  };
}
