import { toSafeNumber } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import type { CalculatedMetrics, Snapshot } from "@/types/schema";

/** 輸入區的四個可收合區塊（PRD 4.2「輸入區分段收合」）。 */
export type InputSectionKey = "assets" | "debts" | "cashFlow" | "goals";

/**
 * 各區塊收合時顯示在標題旁的一行摘要：不必展開也能核對目前的數值。
 * 金額取自 calculateMetrics 的結果，與看板、清單底下的合計是同一個數字。
 */
export function buildInputSectionSummaries(
  draft: Pick<
    Snapshot,
    "debts" | "monthlyExpense" | "targetNetWorth" | "targetCashRatio"
  >,
  metrics: Pick<
    CalculatedMetrics,
    | "totalAssets"
    | "totalLiabilities"
    | "totalIncome"
    | "totalRecurringInvestment"
  >
): Record<InputSectionKey, string> {
  const cashFlow = [
    `收入 ${formatCurrency(metrics.totalIncome)}`,
    `支出 ${formatCurrency(toSafeNumber(draft.monthlyExpense))}`,
  ];
  if (metrics.totalRecurringInvestment > 0) {
    cashFlow.push(
      `定期定額 ${formatCurrency(metrics.totalRecurringInvestment)}`
    );
  }

  // 0 代表尚未設定（PRD 4.2「目標淨資產輸入框」「目標現金比例輸入框」）
  const goals: string[] = [];
  const targetNetWorth = toSafeNumber(draft.targetNetWorth);
  const targetCashRatio = toSafeNumber(draft.targetCashRatio);
  if (targetNetWorth > 0)
    goals.push(`淨資產 ${formatCurrency(targetNetWorth)}`);
  if (targetCashRatio > 0) goals.push(`現金 ${targetCashRatio}%`);

  return {
    assets: `合計 ${formatCurrency(metrics.totalAssets)}`,
    debts:
      draft.debts.length === 0
        ? "尚無負債"
        : `${draft.debts.length} 筆・${formatCurrency(metrics.totalLiabilities)}`,
    cashFlow: cashFlow.join("・"),
    goals: goals.length === 0 ? "尚未設定" : goals.join("・"),
  };
}
