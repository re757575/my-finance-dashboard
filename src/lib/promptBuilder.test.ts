import { describe, expect, it } from "vitest";
import { calculateMetrics } from "@/lib/calculations";
import { buildFinancePrompt } from "@/lib/promptBuilder";
import type { Snapshot } from "@/types/schema";

function baseSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    date: "2026-07-13",
    updatedAt: "2026-07-13T00:00:00.000Z",
    cashSources: [],
    twStockValue: 0,
    usStockValue: 0,
    usStockCurrency: "USD",
    exchangeRate: 0,
    debts: [],
    incomeSources: [],
    monthlyExpense: 0,
    targetNetWorth: 0,
    ...overrides,
  };
}

describe("buildFinancePrompt", () => {
  it("包含今日標題與核心財務指標", () => {
    const draft = baseSnapshot({
      cashSources: [{ id: "1", name: "國泰活期", amount: 100000 }],
      debts: [
        {
          id: "d1",
          name: "信貸",
          category: "信貸",
          principal: 20000,
          annualRate: 0,
          remainingMonths: 0,
          repaymentMethod: "amortizing",
        },
      ],
    });
    const prompt = buildFinancePrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).toContain("我的財務健康檢查（2026-07-13）");
    expect(prompt).toContain("總資產：$100,000");
    expect(prompt).toContain("總負債：$20,000");
    expect(prompt).toContain("個人淨資產：$80,000");
  });

  it("包含現金來源名稱明細", () => {
    const draft = baseSnapshot({
      cashSources: [{ id: "1", name: "緊急備用金", amount: 50000 }],
    });
    const prompt = buildFinancePrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).toContain("緊急備用金：$50,000");
  });

  it("無現金來源時顯示提示文字，而非空清單", () => {
    const draft = baseSnapshot();
    const prompt = buildFinancePrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).toContain("（尚未輸入現金來源）");
  });

  it("無歷史快照時不產生趨勢表格區塊", () => {
    const draft = baseSnapshot();
    const prompt = buildFinancePrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).not.toContain("筆歷史趨勢（已儲存資料）");
    expect(prompt).not.toContain("| 日期 |");
  });

  // PRD 第 9 節 #30：新指標納入 AI 分析提示詞的「今日財務總覽」與資產配置摘要
  it("包含緊急預備金月數、儲蓄率與資產配置比例摘要", () => {
    const draft = baseSnapshot({
      cashSources: [{ id: "1", name: "現金", amount: 350000 }],
      twStockValue: 400000,
      usStockValue: 250000,
      usStockCurrency: "TWD",
      incomeSources: [{ id: "i1", name: "薪資", amount: 68000 }],
      monthlyExpense: 22000,
    });
    const prompt = buildFinancePrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).toContain("緊急預備金月數：15.9 個月（預備充足）");
    expect(prompt).toContain("儲蓄率：67.6%（高儲蓄率）");
    expect(prompt).toContain("資產配置：現金 35.0%／台股 40.0%／美股 25.0%");
    expect(prompt).toContain("FIRE／淨資產目標進度：尚未設定目標淨資產");
  });

  // PRD 第 9 節 #31：FIRE 目標進度已設定時，包含百分比與目標金額；達成目標時額外註記
  it("已設定目標淨資產時，包含 FIRE 進度百分比與目標金額", () => {
    const draft = baseSnapshot({
      cashSources: [{ id: "1", name: "現金", amount: 14200000 }],
      targetNetWorth: 10000000,
    });
    const prompt = buildFinancePrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).toContain(
      "FIRE／淨資產目標進度：142.0%（目標 $10,000,000），已達成目標"
    );
  });

  it("有歷史快照時產生 Markdown 趨勢表格，並依各筆資料計算指標", () => {
    const draft = baseSnapshot();
    const history = [
      baseSnapshot({
        date: "2026-07-11",
        cashSources: [{ id: "1", name: "現金", amount: 100000 }],
      }),
      baseSnapshot({
        date: "2026-07-12",
        cashSources: [{ id: "1", name: "現金", amount: 120000 }],
      }),
    ];
    const prompt = buildFinancePrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: history,
    });

    expect(prompt).toContain("近 2 筆歷史趨勢（已儲存資料）");
    expect(prompt).toContain("| 2026-07-11 |");
    expect(prompt).toContain("| 2026-07-12 |");
    expect(prompt).toContain("$120,000");
  });
});
