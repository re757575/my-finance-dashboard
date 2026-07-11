import { calculateMetrics, DEBT_RATIO_STATUS_LABEL } from "@/lib/calculations";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { CalculatedMetrics, Snapshot } from "@/types/schema";

interface BuildFinancePromptParams {
  currentMonth: string;
  draft: Snapshot;
  metrics: CalculatedMetrics;
  /** 已儲存的歷史快照，依月份遞增排序，供趨勢區塊使用（不含當月未儲存的異動）。 */
  recentSnapshots: Snapshot[];
}

/** 產生給 AI 分析用的財務健康檢查提示詞（Markdown），供「一鍵複製」功能使用。 */
export function buildFinancePrompt({
  currentMonth,
  draft,
  metrics,
  recentSnapshots,
}: BuildFinancePromptParams): string {
  const lines: string[] = [];

  lines.push(`# 我的財務健康檢查（${currentMonth}）`, "");
  lines.push(
    "請你扮演一位專業的個人理財顧問，根據以下資料分析我目前的財務狀況，並提出具體、可執行的行動建議與風險提醒。",
    ""
  );

  lines.push(`## 本月財務總覽（${currentMonth}）`, "");
  lines.push(`- 總資產：${formatCurrency(metrics.totalAssets)}`);
  lines.push(`- 總負債：${formatCurrency(metrics.totalLiabilities)}`);
  lines.push(`- 個人淨資產：${formatCurrency(metrics.netWorth)}`);
  lines.push(
    `- 負債比：${formatPercent(metrics.debtRatio)}（${DEBT_RATIO_STATUS_LABEL[metrics.debtRatioStatus]}）`
  );
  lines.push(`- 現金比例：${formatPercent(metrics.cashRatio)}`);
  lines.push(`- 本月淨現金流：${formatCurrency(draft.cashFlow)}`, "");

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
  lines.push(`- 貸款：${formatCurrency(draft.loan)}`);
  lines.push(`- 其他負債：${formatCurrency(draft.otherDebt)}`, "");

  if (recentSnapshots.length > 0) {
    lines.push(`## 近 ${recentSnapshots.length} 個月趨勢（已儲存資料）`, "");
    lines.push("| 月份 | 總資產 | 總負債 | 淨資產 | 負債比 | 現金比例 |");
    lines.push("|---|---|---|---|---|---|");
    for (const snapshot of recentSnapshots) {
      const m = calculateMetrics(snapshot);
      lines.push(
        `| ${snapshot.month} | ${formatCurrency(m.totalAssets)} | ${formatCurrency(m.totalLiabilities)} | ${formatCurrency(m.netWorth)} | ${formatPercent(m.debtRatio)} | ${formatPercent(m.cashRatio)} |`
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
