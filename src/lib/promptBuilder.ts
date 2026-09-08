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

/** 「一鍵複製 AI 分析提示詞」的可選模式（PRD 4.2 節「AI 分析提示詞多模式」）。 */
export type PromptMode =
  | "health-checkup"
  | "investment-direction"
  | "debt-payoff-strategy"
  | "periodic-review"
  | "asset-rebalancing";

export const PROMPT_MODE_LABEL: Record<PromptMode, string> = {
  "health-checkup": "財務健康檢查",
  "investment-direction": "投資方向評估",
  "debt-payoff-strategy": "負債清償策略",
  "periodic-review": "定期回顧報告",
  "asset-rebalancing": "資產配置再平衡建議",
};

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

/**
 * 產生「投資方向評估」提示詞（PRD 4.2 節）：聚焦股票資產、現金水位、槓桿狀況與近期資產配置趨勢，
 * 指示 AI 綜合市場趨勢、VIX 指數、貪婪與恐懼指數等外部因素（App 本身零網路請求，不擷取這些數值，
 * 完全交由 AI 自行考量），從四種立場中擇一給出進出場建議。與「財務健康檢查」模式故意不共用內容，
 * 不納入負債清單明細、收入明細、每月應還款金額、FIRE 進度等與投資決策關聯度低的資料。
 */
export function buildInvestmentDirectionPrompt({
  currentDate,
  draft,
  metrics,
  recentSnapshots,
}: BuildFinancePromptParams): string {
  const lines: string[] = [];

  lines.push(`# 我的投資方向評估（${currentDate}）`, "");
  lines.push(
    "請你扮演一位資深投資顧問，綜合我目前的資產配置現況，以及你所掌握的市場趨勢、VIX 指數、貪婪與恐懼指數（Fear & Greed Index）等總體市場情緒指標（不限於此），評估我目前適合採取哪一種投資立場。",
    ""
  );

  lines.push(`## 目前資產配置（${currentDate}）`, "");
  lines.push(`- 台股市值：${formatCurrency(draft.twStockValue)}`);
  lines.push(
    `- 美股市值：${formatCurrency(draft.usStockValue)}（計價幣別：${draft.usStockCurrency}，匯率：${draft.exchangeRate}）`
  );
  lines.push(`- 股票市值合計：${formatCurrency(metrics.totalStockValue)}`);
  lines.push(
    `- 資產配置：現金 ${formatPercent(metrics.cashRatio)}／台股 ${formatPercent(metrics.twStockRatio)}／美股 ${formatPercent(metrics.usStockRatio)}`
  );
  lines.push(
    `- 現金比例：${formatPercent(metrics.cashRatio)}（可動用資金水位）`
  );
  lines.push(
    `- 負債比：${formatPercent(metrics.debtRatio)}（${DEBT_RATIO_STATUS_LABEL[metrics.debtRatioStatus]}，財務槓桿狀況）`,
    ""
  );

  if (recentSnapshots.length > 0) {
    lines.push(
      `## 近 ${recentSnapshots.length} 筆資產配置趨勢（已儲存資料）`,
      ""
    );
    lines.push("| 日期 | 淨資產 | 現金比例 | 股票比例 |");
    lines.push("|---|---|---|---|");
    for (const snapshot of recentSnapshots) {
      const m = calculateMetrics(snapshot);
      const stockRatio = 100 - m.cashRatio;
      lines.push(
        `| ${snapshot.date} | ${formatCurrency(m.netWorth)} | ${formatPercent(m.cashRatio)} | ${formatPercent(stockRatio)} |`
      );
    }
    lines.push("");
  }

  lines.push("## 我想請你評估", "");
  lines.push(
    "請從以下四種立場中選一個最符合我目前狀況的建議，並說明理由與風險提醒：",
    ""
  );
  lines.push("1. **積極加碼**：趁勢加大部位");
  lines.push("2. **維持現狀／定期定額**：按原計畫持續投入，不特別加減碼");
  lines.push("3. **停利／減碼**：部分獲利了結，降低部位");
  lines.push("4. **空手觀望／保留現金**：暫不進場，優先持有現金");
  lines.push("");
  lines.push(
    "分析時請綜合考量（不限於）：目前整體市場趨勢、VIX 指數、貪婪與恐懼指數、我的現金水位與槓桿狀況、資產配置是否過度集中單一類別。"
  );

  return lines.join("\n");
}

/**
 * 產生「負債清償策略」提示詞（PRD 4.2 節）：列出每筆負債明細與現金狀況，
 * 指示 AI 建議清償優先順序（雪崩法／雪球法）、是否適合提前還款或轉貸。
 */
export function buildDebtPayoffPrompt({
  currentDate,
  draft,
  metrics,
}: BuildFinancePromptParams): string {
  const lines: string[] = [];

  lines.push(`# 我的負債清償策略評估（${currentDate}）`, "");
  lines.push(
    "請你扮演一位個人債務管理顧問，根據以下我的負債明細與現金狀況，建議最適合的清償優先順序（例如雪崩法優先還高利率、或雪球法優先還小額），並評估是否有負債適合提前還款或轉貸。",
    ""
  );

  lines.push(`## 目前負債明細（${currentDate}）`, "");
  if (draft.debts.length === 0) {
    lines.push("（目前無負債，無需清償策略評估）");
  } else {
    for (const debt of draft.debts) {
      const methodLabel =
        debt.repaymentMethod === "interestOnly" ? "只計息" : "本息平均攤還";
      lines.push(
        `- ${debt.name || "未命名"}（${debt.category}）：剩餘本金 ${formatCurrency(debt.principal)}，年利率 ${debt.annualRate}%，剩餘 ${debt.remainingMonths} 期，${methodLabel}，每月應還 ${formatCurrency(calculateMonthlyPayment(debt))}`
      );
    }
    lines.push(
      `- 本月應還款總額：${formatCurrency(metrics.totalMonthlyDebtPayment)}`
    );
  }
  lines.push("");

  lines.push("## 現金狀況", "");
  lines.push(
    `- 本月淨現金流（可運用資金）：${formatCurrency(metrics.cashFlow)}`
  );
  lines.push(
    `- 緊急預備金月數：${formatMonths(metrics.emergencyFundMonths)}（${EMERGENCY_FUND_STATUS_LABEL[metrics.emergencyFundStatus]}）`,
    ""
  );

  lines.push("## 我想請你評估", "");
  lines.push("1. 這些負債的清償優先順序建議是什麼？為什麼？");
  lines.push("2. 有沒有哪筆負債適合提前還款或轉貸？");
  lines.push(
    "3. 在維持足夠緊急預備金的前提下，每月可以額外投入多少資金加速清償？"
  );

  return lines.join("\n");
}

/**
 * 產生「定期回顧報告」提示詞（PRD 4.2 節）：以目前趨勢範圍下拉選單所選的已儲存快照為期間，
 * 統整期初/期末淨資產、負債比、儲蓄率、資產配置變化，指示 AI 寫一份回顧總結。
 * 快照筆數不足 2 筆時（無法構成一段期間）改顯示提示文字，不勉強產生報告。
 */
export function buildPeriodicReviewPrompt({
  currentDate,
  recentSnapshots,
}: BuildFinancePromptParams): string {
  const lines: string[] = [];

  lines.push(`# 我的資產健康回顧報告（${currentDate}）`, "");

  if (recentSnapshots.length < 2) {
    lines.push(
      "目前已儲存的快照筆數不足（至少需要 2 筆，才能構成一段可比較的期間），暫時無法產生有意義的回顧報告。可以先切換上方的趨勢範圍下拉選單擴大範圍，或持續使用一段時間後再回來產生報告。"
    );
    return lines.join("\n");
  }

  lines.push(
    "請你扮演一位個人財務顧問，根據以下這段期間我的資產變化，寫一份簡短的回顧總結（財務體質是變好還是變差、有哪些值得留意的轉折點），並提出下一階段最該優先做的一件事。",
    ""
  );

  const sorted = [...recentSnapshots].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const first = sorted[0];
  const last = sorted.at(-1) as Snapshot;
  const firstMetrics = calculateMetrics(first);
  const lastMetrics = calculateMetrics(last);
  const netWorths = sorted.map((s) => calculateMetrics(s).netWorth);
  const maxNetWorth = Math.max(...netWorths);
  const minNetWorth = Math.min(...netWorths);
  const netWorthChange = lastMetrics.netWorth - firstMetrics.netWorth;
  const netWorthChangeRate =
    firstMetrics.netWorth === 0
      ? null
      : (netWorthChange / Math.abs(firstMetrics.netWorth)) * 100;
  let netWorthChangeRateNote = "";
  if (netWorthChangeRate !== null) {
    const sign = netWorthChangeRate >= 0 ? "+" : "";
    netWorthChangeRateNote = `（${sign}${netWorthChangeRate.toFixed(1)}%）`;
  }

  lines.push(
    `## 回顧期間：${first.date} ～ ${last.date}（共 ${sorted.length} 筆快照）`,
    ""
  );
  lines.push(
    `- 期初淨資產（${first.date}）：${formatCurrency(firstMetrics.netWorth)}`
  );
  lines.push(
    `- 期末淨資產（${last.date}）：${formatCurrency(lastMetrics.netWorth)}`
  );
  lines.push(
    `- 期間淨資產變化：${formatCurrency(netWorthChange)}${netWorthChangeRateNote}`
  );
  lines.push(
    `- 期間最高／最低淨資產：${formatCurrency(maxNetWorth)} ／ ${formatCurrency(minNetWorth)}`
  );
  lines.push(
    `- 負債比：${formatPercent(firstMetrics.debtRatio)} → ${formatPercent(lastMetrics.debtRatio)}`
  );
  lines.push(
    `- 儲蓄率：${formatPercent(firstMetrics.savingsRate)} → ${formatPercent(lastMetrics.savingsRate)}`
  );
  lines.push(
    `- 資產配置（現金／股票）：${formatPercent(firstMetrics.cashRatio)}／${formatPercent(100 - firstMetrics.cashRatio)} → ${formatPercent(lastMetrics.cashRatio)}／${formatPercent(100 - lastMetrics.cashRatio)}`,
    ""
  );

  lines.push("## 期間趨勢明細", "");
  lines.push("| 日期 | 淨資產 | 負債比 | 儲蓄率 | 現金比例 |");
  lines.push("|---|---|---|---|---|");
  for (const snapshot of sorted) {
    const m = calculateMetrics(snapshot);
    lines.push(
      `| ${snapshot.date} | ${formatCurrency(m.netWorth)} | ${formatPercent(m.debtRatio)} | ${formatPercent(m.savingsRate)} | ${formatPercent(m.cashRatio)} |`
    );
  }
  lines.push("");

  lines.push("## 我想請你分析", "");
  lines.push("1. 這段期間整體財務體質是變好還是變差？主要驅動原因是什麼？");
  lines.push(
    "2. 有哪些數字轉折點特別值得留意（例如負債比突然上升、儲蓄率下滑）？"
  );
  lines.push("3. 下一階段最該優先做的一件事是什麼？");

  return lines.join("\n");
}

/**
 * 產生「資產配置再平衡建議」提示詞（PRD 4.2 節）：比對目前配置與使用者設定的目標現金比例
 * （`targetCashRatio`，0 代表尚未設定），指示 AI 給出具體再平衡做法。
 */
export function buildAssetRebalancingPrompt({
  currentDate,
  draft,
  metrics,
}: BuildFinancePromptParams): string {
  const lines: string[] = [];

  lines.push(`# 我的資產配置再平衡建議（${currentDate}）`, "");
  lines.push(
    "請你扮演一位資產配置顧問，比對我目前的資產配置與目標配置的落差，建議具體的再平衡做法（要調節多少金額、分批或一次性執行、有沒有風險提醒）。",
    ""
  );

  lines.push(`## 目前資產配置（${currentDate}）`, "");
  lines.push(`- 總資產：${formatCurrency(metrics.totalAssets)}`);
  lines.push(
    `- 目前配置：現金 ${formatPercent(metrics.cashRatio)}／台股 ${formatPercent(metrics.twStockRatio)}／美股 ${formatPercent(metrics.usStockRatio)}`,
    ""
  );

  lines.push("## 目標配置", "");
  if (draft.targetCashRatio === 0) {
    lines.push(
      "我尚未設定目標現金比例。請你依常見的資產配置原則（如風險分散、緊急預備金水位），幫我建議一個合理的目標現金比例區間，並說明理由。",
      ""
    );
  } else {
    const targetStockRatio = 100 - draft.targetCashRatio;
    const cashGap = metrics.cashRatio - draft.targetCashRatio;
    const cashGapAmount = (cashGap / 100) * metrics.totalAssets;
    lines.push(
      `- 目標配置：現金 ${formatPercent(draft.targetCashRatio)}／股票（不分台美股）${formatPercent(targetStockRatio)}`
    );
    lines.push(
      `- 現金落差：${cashGap >= 0 ? "+" : ""}${formatPercent(cashGap)}（${cashGap >= 0 ? "現金超配" : "現金低配（股票超配）"}，約 ${formatCurrency(Math.abs(cashGapAmount))}）`,
      ""
    );
  }

  lines.push("## 我想請你評估", "");
  lines.push("1. 目前的配置跟目標（或合理區間）落差大不大？需要調整嗎？");
  lines.push(
    "2. 如果需要調整，建議怎麼執行（一次到位還是分批、先賣什麼買什麼）？"
  );
  lines.push("3. 執行這個調整前，有沒有什麼風險或稅務/手續費考量需要注意？");

  return lines.join("\n");
}

const PROMPT_BUILDERS: Record<
  PromptMode,
  (params: BuildFinancePromptParams) => string
> = {
  "health-checkup": buildFinancePrompt,
  "investment-direction": buildInvestmentDirectionPrompt,
  "debt-payoff-strategy": buildDebtPayoffPrompt,
  "periodic-review": buildPeriodicReviewPrompt,
  "asset-rebalancing": buildAssetRebalancingPrompt,
};

/** 依模式分派給對應的提示詞產生函式（PRD 4.2 節「AI 分析提示詞多模式」）。 */
export function buildPromptForMode(
  mode: PromptMode,
  params: BuildFinancePromptParams
): string {
  return PROMPT_BUILDERS[mode](params);
}
