import type {
  CalculatedMetrics,
  CashSource,
  DebtRatioStatus,
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
    | "loan"
    | "otherDebt"
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
  const totalLiabilities =
    toSafeNumber(snapshot.loan) + toSafeNumber(snapshot.otherDebt);
  const netWorth = totalAssets - totalLiabilities;
  // 總資產為 0 時負債比預設為 0%，避免除以零（PRD 第 5 節）
  const debtRatio =
    totalAssets === 0 ? 0 : (totalLiabilities / totalAssets) * 100;

  return {
    totalCash,
    totalStockValue,
    totalAssets,
    totalLiabilities,
    netWorth,
    debtRatio,
    debtRatioStatus: calculateDebtRatioStatus(debtRatio),
  };
}
