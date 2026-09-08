import {
  calculateMetrics,
  calculateMonthlyPayment,
  DEBT_RATIO_STATUS_LABEL,
  EMERGENCY_FUND_STATUS_LABEL,
  SAVINGS_RATE_STATUS_LABEL,
} from "@/lib/calculations";
import { formatCurrency, formatMonths, formatPercent } from "@/lib/format";
import type { CalculatedMetrics, Snapshot } from "@/types/schema";

interface BuildFinancePromptParams {
  currentDate: string;
  draft: Snapshot;
  metrics: CalculatedMetrics;
  /** 已儲存的歷史快照，依日期遞增排序，供趨勢區塊使用（不含今日未儲存的異動）。 */
  recentSnapshots: Snapshot[];
}

/** FIRE／淨資產目標進度的一行摘要文字，未設定目標時給出明確提示，避免 AI 誤以為 0% 是負面訊號。 */
function formatGoalProgressLine(
  metrics: CalculatedMetrics,
  targetNetWorth: number
): string {
  if (metrics.goalProgress === null) return "尚未設定目標淨資產";
  const achievedNote = metrics.goalProgress >= 100 ? "，已達成目標" : "";
  return `${formatPercent(metrics.goalProgress)}（目標 ${formatCurrency(targetNetWorth)}）${achievedNote}`;
}

/** 產生給 AI 分析用的財務健康檢查提示詞（Markdown），供「一鍵複製」功能使用。 */
export function buildFinancePrompt({
  currentDate,
  draft,
  metrics,
  recentSnapshots,
}: BuildFinancePromptParams): string {
  const lines: string[] = [];

  lines.push(`# 我的財務健康檢查（${currentDate}）`, "");
  lines.push(
    "請你扮演一位專業的個人理財顧問，根據以下資料分析我目前的財務狀況，並提出具體、可執行的行動建議與風險提醒。",
    ""
  );

  lines.push(`## 今日財務總覽（${currentDate}）`, "");
  lines.push(`- 總資產：${formatCurrency(metrics.totalAssets)}`);
  lines.push(`- 總負債：${formatCurrency(metrics.totalLiabilities)}`);
  lines.push(`- 個人淨資產：${formatCurrency(metrics.netWorth)}`);
  lines.push(
    `- 負債比：${formatPercent(metrics.debtRatio)}（${DEBT_RATIO_STATUS_LABEL[metrics.debtRatioStatus]}）`
  );
  lines.push(`- 現金比例：${formatPercent(metrics.cashRatio)}`);
  lines.push(
    `- 本月應還款總額：${formatCurrency(metrics.totalMonthlyDebtPayment)}`
  );
  lines.push(`- 本月淨現金流：${formatCurrency(metrics.cashFlow)}`);
  lines.push(
    `- 緊急預備金月數：${formatMonths(metrics.emergencyFundMonths)}（${EMERGENCY_FUND_STATUS_LABEL[metrics.emergencyFundStatus]}）`
  );
  lines.push(
    `- 儲蓄率：${formatPercent(metrics.savingsRate)}（${SAVINGS_RATE_STATUS_LABEL[metrics.savingsRateStatus]}）`
  );
  lines.push(
    `- FIRE／淨資產目標進度：${formatGoalProgressLine(metrics, draft.targetNetWorth)}`,
    ""
  );

  lines.push(
    `- 資產配置：現金 ${formatPercent(metrics.cashRatio)}／台股 ${formatPercent(metrics.twStockRatio)}／美股 ${formatPercent(metrics.usStockRatio)}`,
    ""
  );

  lines.push("### 現金來源明細", "");
  if (draft.cashSources.length === 0) {
    lines.push("（尚未輸入現金來源）");
  } else {
    for (const source of draft.cashSources) {
      lines.push(
        `- ${source.name || "未命名"}：${formatCurrency(source.amount)}`
      );
    }
  }
  lines.push("");

  lines.push("### 股票資產", "");
  lines.push(`- 台股市值：${formatCurrency(draft.twStockValue)}`);
  lines.push(
    `- 美股市值：${formatCurrency(draft.usStockValue)}（計價幣別：${draft.usStockCurrency}，匯率：${draft.exchangeRate}）`
  );
  lines.push("");

  lines.push("### 負債明細", "");
  if (draft.debts.length === 0) {
    lines.push("（尚未新增負債）");
  } else {
    for (const debt of draft.debts) {
      const methodLabel =
        debt.repaymentMethod === "interestOnly" ? "只計息" : "本息平均攤還";
      lines.push(
        `- ${debt.name || "未命名"}（${debt.category}）：本金 ${formatCurrency(debt.principal)}，年利率 ${debt.annualRate}%，剩餘 ${debt.remainingMonths} 期，${methodLabel}，每月應還 ${formatCurrency(calculateMonthlyPayment(debt))}`
      );
    }
  }
  lines.push("");

  lines.push("### 收入明細", "");
  if (draft.incomeSources.length === 0) {
    lines.push("（尚未新增收入）");
  } else {
    for (const source of draft.incomeSources) {
      lines.push(
        `- ${source.name || "未命名"}：${formatCurrency(source.amount)}`
      );
    }
  }
  lines.push(`- 本月支出：${formatCurrency(draft.monthlyExpense)}`, "");

  if (recentSnapshots.length > 0) {
    lines.push(`## 近 ${recentSnapshots.length} 筆歷史趨勢（已儲存資料）`, "");
    lines.push("| 日期 | 總資產 | 總負債 | 淨資產 | 負債比 | 現金比例 |");
    lines.push("|---|---|---|---|---|---|");
    for (const snapshot of recentSnapshots) {
      const m = calculateMetrics(snapshot);
      lines.push(
        `| ${snapshot.date} | ${formatCurrency(m.totalAssets)} | ${formatCurrency(m.totalLiabilities)} | ${formatCurrency(m.netWorth)} | ${formatPercent(m.debtRatio)} | ${formatPercent(m.cashRatio)} |`
      );
    }
    lines.push("");
  }

  lines.push("## 我想請你分析", "");
  lines.push("1. 目前的財務健康程度如何？有哪些警訊或亮點？");
  lines.push("2. 根據以上趨勢變化，資產配置或負債控管上有什麼具體建議？");
  lines.push("3. 如果下個月只能做一件事來改善財務體質，你會建議什麼？");

  return lines.join("\n");
}
