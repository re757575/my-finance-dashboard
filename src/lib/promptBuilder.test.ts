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
