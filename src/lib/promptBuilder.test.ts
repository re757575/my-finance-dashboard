import { describe, expect, it } from "vitest";
import { calculateMetrics } from "@/lib/calculations";
import {
  buildAssetRebalancingPrompt,
  buildDebtPayoffPrompt,
  buildFinancePrompt,
  buildInvestmentDirectionPrompt,
  buildPeriodicReviewPrompt,
  buildPromptForMode,
} from "@/lib/promptBuilder";
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
    realEstateValue: 0,
    debts: [],
    incomeSources: [],
    monthlyExpense: 0,
    targetNetWorth: 0,
    targetCashRatio: 0,
    ...overrides,
  };
}

describe("buildFinancePrompt", () => {
  it("包含今日標題與核心財務指標", () => {
    const draft = baseSnapshot({
      cashSources: [
        { id: "1", name: "國泰活期", amount: 100000, restricted: false },
      ],
      debts: [
        {
          id: "d1",
          name: "信貸",
          category: "信貸",
          principal: 20000,
          annualRate: 0,
          remainingMonths: 0,
          repaymentMethod: "amortizing",
          collateralValue: 0,
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
      cashSources: [
        { id: "1", name: "緊急備用金", amount: 50000, restricted: false },
      ],
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
      cashSources: [
        { id: "1", name: "現金", amount: 350000, restricted: false },
      ],
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
      cashSources: [
        { id: "1", name: "現金", amount: 14200000, restricted: false },
      ],
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
        cashSources: [
          { id: "1", name: "現金", amount: 100000, restricted: false },
        ],
      }),
      baseSnapshot({
        date: "2026-07-12",
        cashSources: [
          { id: "1", name: "現金", amount: 120000, restricted: false },
        ],
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

  // PRD 5.2b 節、第 9 節 #61i：償債負擔率緊接在本月應還款總額之後
  describe("償債負擔率", () => {
    const debts: Snapshot["debts"] = [
      {
        id: "d1",
        name: "信貸",
        category: "信貸",
        principal: 144000,
        annualRate: 0,
        remainingMonths: 12,
        repaymentMethod: "amortizing",
        collateralValue: 0,
      },
    ];
    const build = (draft: Snapshot) =>
      buildFinancePrompt({
        currentDate: "2026-07-13",
        draft,
        metrics: calculateMetrics(draft),
        recentSnapshots: [],
      });

    it("今日財務總覽在本月應還款總額之後列出比率、狀態與分子分母", () => {
      const lines = build(
        baseSnapshot({
          debts,
          incomeSources: [{ id: "i1", name: "薪資", amount: 30000 }],
        })
      ).split("\n");

      const index = lines.indexOf("- 本月應還款總額：$12,000");
      expect(index).toBeGreaterThan(-1);
      expect(lines[index + 1]).toBe(
        "- 償債負擔率：40.0%（負擔偏重；本月應還款總額 $12,000 ÷ 總收入 $30,000）"
      );
    });

    it("沒有負債時為 0.0%（無還款負擔）", () => {
      expect(build(baseSnapshot())).toContain(
        "- 償債負擔率：0.0%（無還款負擔；本月應還款總額 $0 ÷ 總收入 $0）"
      );
    });

    it("總收入為 0 但有應還款時明確說明無法計算，不出現 NaN／Infinity", () => {
      const prompt = build(baseSnapshot({ debts }));

      expect(prompt).toContain(
        "- 償債負擔率：無法計算（無收入可負擔；總收入為 0，但本月應還款總額為 $12,000）"
      );
      expect(prompt).not.toMatch(/NaN|Infinity/);
    });
  });
});

// PRD 第 9 節 #33、#33a、#33b：投資方向評估模式
describe("buildInvestmentDirectionPrompt", () => {
  it("包含標題、股票資產、資產配置與槓桿狀況，並指示 AI 考量外部市場因素", () => {
    const draft = baseSnapshot({
      cashSources: [
        { id: "1", name: "現金", amount: 350000, restricted: false },
      ],
      twStockValue: 400000,
      usStockValue: 250000,
      usStockCurrency: "TWD",
      debts: [
        {
          id: "d1",
          name: "信貸",
          category: "信貸",
          principal: 100000,
          annualRate: 0,
          remainingMonths: 0,
          repaymentMethod: "amortizing",
          collateralValue: 0,
        },
      ],
    });
    const prompt = buildInvestmentDirectionPrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).toContain("我的投資方向評估（2026-07-13）");
    expect(prompt).toContain("台股市值：$400,000");
    expect(prompt).toContain("美股市值：$250,000");
    expect(prompt).toContain("資產配置：現金 35.0%／台股 40.0%／美股 25.0%");
    expect(prompt).toContain("現金比例：35.0%（可動用資金水位）");
    expect(prompt).toContain("負債比：10.0%");
    expect(prompt).toContain("VIX 指數、貪婪與恐懼指數");
  });

  it("明確列出四種投資立場供 AI 擇一", () => {
    const draft = baseSnapshot();
    const prompt = buildInvestmentDirectionPrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).toContain("積極加碼");
    expect(prompt).toContain("維持現狀／定期定額");
    expect(prompt).toContain("停利／減碼");
    expect(prompt).toContain("空手觀望／保留現金");
  });

  // PRD 第 9 節 #33a：不含與投資決策關聯度低的資料
  it("不包含負債清單明細、收入明細、每月應還款金額、FIRE 進度", () => {
    const draft = baseSnapshot({
      debts: [
        {
          id: "d1",
          name: "房貸",
          category: "房貸",
          principal: 3000000,
          annualRate: 2.1,
          remainingMonths: 240,
          repaymentMethod: "amortizing",
          collateralValue: 0,
        },
      ],
      incomeSources: [{ id: "i1", name: "薪資", amount: 68000 }],
      targetNetWorth: 10000000,
    });
    const prompt = buildInvestmentDirectionPrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).not.toContain("負債明細");
    expect(prompt).not.toContain("收入明細");
    expect(prompt).not.toContain("每月應還");
    expect(prompt).not.toContain("FIRE");
  });

  // PRD 第 9 節 #33b：近期資產配置趨勢表格
  it("有歷史快照時產生淨資產／現金比例／股票比例趨勢表格", () => {
    const draft = baseSnapshot();
    const history = [
      baseSnapshot({
        date: "2026-07-11",
        cashSources: [
          { id: "1", name: "現金", amount: 300000, restricted: false },
        ],
        twStockValue: 700000,
      }),
    ];
    const prompt = buildInvestmentDirectionPrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: history,
    });

    expect(prompt).toContain("近 1 筆資產配置趨勢（已儲存資料）");
    expect(prompt).toContain("| 日期 | 淨資產 | 現金比例 | 股票比例 |");
    expect(prompt).toContain("| 2026-07-11 | $1,000,000 | 30.0% | 70.0% |");
  });

  it("無歷史快照時不產生趨勢表格區塊", () => {
    const draft = baseSnapshot();
    const prompt = buildInvestmentDirectionPrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).not.toContain("筆資產配置趨勢（已儲存資料）");
  });
});

describe("buildPromptForMode", () => {
  it("health-checkup 模式會呼叫財務健康檢查提示詞", () => {
    const draft = baseSnapshot();
    const params = {
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    };
    expect(buildPromptForMode("health-checkup", params)).toBe(
      buildFinancePrompt(params)
    );
  });

  it("investment-direction 模式會呼叫投資方向評估提示詞", () => {
    const draft = baseSnapshot();
    const params = {
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    };
    expect(buildPromptForMode("investment-direction", params)).toBe(
      buildInvestmentDirectionPrompt(params)
    );
  });

  it("debt-payoff-strategy 模式會呼叫負債清償策略提示詞", () => {
    const draft = baseSnapshot();
    const params = {
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    };
    expect(buildPromptForMode("debt-payoff-strategy", params)).toBe(
      buildDebtPayoffPrompt(params)
    );
  });

  it("periodic-review 模式會呼叫定期回顧報告提示詞", () => {
    const draft = baseSnapshot();
    const params = {
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    };
    expect(buildPromptForMode("periodic-review", params)).toBe(
      buildPeriodicReviewPrompt(params)
    );
  });

  it("asset-rebalancing 模式會呼叫資產配置再平衡建議提示詞", () => {
    const draft = baseSnapshot();
    const params = {
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    };
    expect(buildPromptForMode("asset-rebalancing", params)).toBe(
      buildAssetRebalancingPrompt(params)
    );
  });
});

describe("buildDebtPayoffPrompt", () => {
  it("列出每筆負債明細、每月應還款總額與現金狀況", () => {
    const draft = baseSnapshot({
      cashSources: [
        { id: "1", name: "現金", amount: 300000, restricted: false },
      ],
      monthlyExpense: 20000,
      debts: [
        {
          id: "d1",
          name: "信貸",
          category: "信貸",
          principal: 200000,
          annualRate: 8,
          remainingMonths: 24,
          repaymentMethod: "amortizing",
          collateralValue: 0,
        },
        {
          id: "d2",
          name: "房貸",
          category: "房貸",
          principal: 3000000,
          annualRate: 2.1,
          remainingMonths: 240,
          repaymentMethod: "amortizing",
          collateralValue: 0,
        },
      ],
    });
    const prompt = buildDebtPayoffPrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).toContain("我的負債清償策略評估（2026-07-13）");
    expect(prompt).toContain("信貸（信貸）：剩餘本金 $200,000，年利率 8%");
    expect(prompt).toContain("房貸（房貸）：剩餘本金 $3,000,000，年利率 2.1%");
    expect(prompt).toContain("緊急預備金月數：");
    expect(prompt).toContain("本月淨現金流（可運用資金）：");
  });

  it("無負債時顯示提示文字，而非空清單", () => {
    const draft = baseSnapshot();
    const prompt = buildDebtPayoffPrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).toContain("（目前無負債，無需清償策略評估）");
    // 負債清單為空時不輸出本月應還款總額與償債負擔率
    expect(prompt).not.toContain("償債負擔率");
  });

  // PRD 5.2b 節、第 9 節 #61i：償債負擔率緊接在本月應還款總額之後
  describe("償債負擔率", () => {
    const debts: Snapshot["debts"] = [
      {
        id: "d1",
        name: "信貸",
        category: "信貸",
        principal: 144000,
        annualRate: 0,
        remainingMonths: 12,
        repaymentMethod: "amortizing",
        collateralValue: 0,
      },
    ];
    const build = (draft: Snapshot) =>
      buildDebtPayoffPrompt({
        currentDate: "2026-07-13",
        draft,
        metrics: calculateMetrics(draft),
        recentSnapshots: [],
      });

    it("在本月應還款總額之後列出比率、狀態與分子分母", () => {
      const lines = build(
        baseSnapshot({
          debts,
          incomeSources: [{ id: "i1", name: "薪資", amount: 25000 }],
        })
      ).split("\n");

      const index = lines.indexOf("- 本月應還款總額：$12,000");
      expect(index).toBeGreaterThan(-1);
      expect(lines[index + 1]).toBe(
        "- 償債負擔率：48.0%（負擔過重；本月應還款總額 $12,000 ÷ 總收入 $25,000）"
      );
    });

    it("總收入為 0 但有應還款時明確說明無法計算，不出現 NaN／Infinity", () => {
      const prompt = build(baseSnapshot({ debts }));

      expect(prompt).toContain(
        "- 償債負擔率：無法計算（無收入可負擔；總收入為 0，但本月應還款總額為 $12,000）"
      );
      expect(prompt).not.toMatch(/NaN|Infinity/);
    });
  });
});

describe("buildPeriodicReviewPrompt", () => {
  // 快照筆數不足 2 筆時，無法構成一段可比較的期間
  it("快照筆數少於 2 筆時，顯示筆數不足提示，不產生完整報告", () => {
    const draft = baseSnapshot();
    const prompt = buildPeriodicReviewPrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).toContain("快照筆數不足");
    expect(prompt).not.toContain("回顧期間");
  });

  it("有至少 2 筆快照時，產生期初/期末比較與趨勢明細表格", () => {
    const draft = baseSnapshot();
    const history = [
      baseSnapshot({
        date: "2026-06-01",
        cashSources: [
          { id: "1", name: "現金", amount: 500000, restricted: false },
        ],
      }),
      baseSnapshot({
        date: "2026-07-01",
        cashSources: [
          { id: "1", name: "現金", amount: 600000, restricted: false },
        ],
      }),
    ];
    const prompt = buildPeriodicReviewPrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: history,
    });

    expect(prompt).toContain(
      "回顧期間：2026-06-01 ～ 2026-07-01（共 2 筆快照）"
    );
    expect(prompt).toContain("期初淨資產（2026-06-01）：$500,000");
    expect(prompt).toContain("期末淨資產（2026-07-01）：$600,000");
    expect(prompt).toContain("期間淨資產變化：$100,000（+20.0%）");
    expect(prompt).toContain("| 2026-06-01 |");
    expect(prompt).toContain("| 2026-07-01 |");
  });
});

describe("buildAssetRebalancingPrompt", () => {
  // 目標未設定時，改請 AI 自行建議合理的目標配置
  it("目標現金比例未設定時，指示 AI 自行建議合理配置", () => {
    const draft = baseSnapshot({
      cashSources: [
        { id: "1", name: "現金", amount: 350000, restricted: false },
      ],
      twStockValue: 650000,
      targetCashRatio: 0,
    });
    const prompt = buildAssetRebalancingPrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).toContain("目前配置：現金 35.0%／台股 65.0%／美股 0.0%");
    expect(prompt).toContain("我尚未設定目標現金比例");
  });

  it("已設定目標現金比例時，計算落差百分比與金額", () => {
    const draft = baseSnapshot({
      cashSources: [
        { id: "1", name: "現金", amount: 350000, restricted: false },
      ],
      twStockValue: 650000,
      targetCashRatio: 20,
    });
    const prompt = buildAssetRebalancingPrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).toContain("目標配置：現金 20.0%／股票（不分台美股）80.0%");
    expect(prompt).toContain("現金落差：+15.0%（現金超配，約 $150,000）");
  });

  it("現金低配（股票超配）時，落差顯示為負且註明現金低配", () => {
    const draft = baseSnapshot({
      cashSources: [
        { id: "1", name: "現金", amount: 100000, restricted: false },
      ],
      twStockValue: 900000,
      targetCashRatio: 30,
    });
    const prompt = buildAssetRebalancingPrompt({
      currentDate: "2026-07-13",
      draft,
      metrics: calculateMetrics(draft),
      recentSnapshots: [],
    });

    expect(prompt).toContain(
      "現金落差：-20.0%（現金低配（股票超配），約 $200,000）"
    );
  });
});

// PRD 4.2「AI 分析提示詞多模式」第 9 點：V2.6 新增資料（不動產、不可動用現金、質押維持率）
describe("提示詞：不動產／不可動用現金／質押維持率", () => {
  const params = (draft: ReturnType<typeof baseSnapshot>) => ({
    currentDate: "2026-07-13",
    draft,
    metrics: calculateMetrics(draft),
    recentSnapshots: [],
  });

  const richDraft = baseSnapshot({
    cashSources: [
      { id: "1", name: "活存", amount: 200000, restricted: false },
      { id: "2", name: "期貨保證金", amount: 100000, restricted: true },
    ],
    twStockValue: 400000,
    usStockValue: 300000,
    usStockCurrency: "TWD",
    realEstateValue: 5000000,
    debts: [
      {
        id: "d1",
        name: "股票質押",
        category: "質押",
        principal: 500000,
        annualRate: 3.5,
        remainingMonths: 12,
        repaymentMethod: "interestOnly",
        collateralValue: 800000,
      },
    ],
  });

  it("財務健康檢查：列出不動產、不可動用現金、質押維持率，並在現金來源標註不可動用", () => {
    const prompt = buildFinancePrompt(params(richDraft));

    expect(prompt).toContain("其中不動產市值：$5,000,000");
    expect(prompt).toContain("不可動用現金：$100,000");
    expect(prompt).toContain("期貨保證金：$100,000（不可動用）");
    expect(prompt).not.toContain("活存：$200,000（不可動用）");
    expect(prompt).toContain(
      "質押整戶維持率：160.0%（維持率安全，擔保品再下跌 18.8% 將觸及 130% 追繳線）"
    );
    expect(prompt).toContain("質押股票市值 $800,000（維持率 160.0%）");
    expect(prompt).toContain(
      "資產配置：現金 20.0%／不可動用現金 10.0%／台股 40.0%／美股 30.0%"
    );
  });

  it("沒有不動產、不可動用現金、質押負債時，不出現相關行", () => {
    const draft = baseSnapshot({
      cashSources: [
        { id: "1", name: "現金", amount: 100000, restricted: false },
      ],
    });
    const prompt = buildFinancePrompt(params(draft));

    expect(prompt).not.toContain("不動產");
    expect(prompt).not.toContain("不可動用");
    expect(prompt).not.toContain("質押整戶維持率");
  });

  it("尚未填寫質押股票市值時，明確說明尚未填寫，不顯示百分比", () => {
    const draft = baseSnapshot({
      debts: [
        {
          id: "d1",
          name: "股票質押",
          category: "質押",
          principal: 500000,
          annualRate: 3.5,
          remainingMonths: 12,
          repaymentMethod: "interestOnly",
          collateralValue: 0,
        },
      ],
    });
    const prompt = buildFinancePrompt(params(draft));

    expect(prompt).toContain(
      "質押整戶維持率：尚未填寫質押股票市值（質押負債本金 $500,000）"
    );
    expect(prompt).toContain("質押股票市值尚未填寫");
  });

  it("低於追繳線時，摘要註明已低於追繳線", () => {
    const draft = baseSnapshot({
      debts: [
        {
          id: "d1",
          name: "股票質押",
          category: "質押",
          principal: 500000,
          annualRate: 3.5,
          remainingMonths: 12,
          repaymentMethod: "interestOnly",
          collateralValue: 600000,
        },
      ],
    });
    const prompt = buildFinancePrompt(params(draft));

    expect(prompt).toContain(
      "質押整戶維持率：120.0%（低於追繳線，已低於追繳線）"
    );
  });

  it("投資方向評估：列出不可動用現金與質押維持率，股票比例為台股＋美股（不含不可動用現金）", () => {
    const prompt = buildInvestmentDirectionPrompt({
      ...params(richDraft),
      recentSnapshots: [richDraft],
    });

    expect(prompt).toContain("不可動用現金：$100,000");
    expect(prompt).toContain("質押整戶維持率：160.0%");
    // 趨勢表格的股票比例應為 40% + 30% = 70%，而非 100% − 現金比例 20% = 80%
    expect(prompt).toContain("| 2026-07-13 | $5,500,000 | 20.0% | 70.0% |");
  });

  it("負債清償策略：質押負債列出質押股票市值與維持率", () => {
    const prompt = buildDebtPayoffPrompt(params(richDraft));

    expect(prompt).toContain("質押股票市值 $800,000（維持率 160.0%）");
    expect(prompt).toContain("質押整戶維持率：160.0%");
  });

  it("資產配置再平衡：落差金額以金融資產為基準，並說明不動產不計入", () => {
    const draft = baseSnapshot({
      cashSources: [
        { id: "1", name: "現金", amount: 350000, restricted: false },
      ],
      twStockValue: 650000,
      realEstateValue: 9000000,
      targetCashRatio: 20,
    });
    const prompt = buildAssetRebalancingPrompt(params(draft));

    expect(prompt).toContain("金融資產（現金＋股票）：$1,000,000");
    expect(prompt).toContain(
      "另有不動產：$9,000,000（不計入配置比例，無法用於再平衡）"
    );
    // 現金 35% 對目標 20%，落差 15% × 金融資產 1,000,000 = 150,000（不受不動產影響）
    expect(prompt).toContain("現金落差：+15.0%（現金超配，約 $150,000）");
  });

  it("定期回顧報告：現金／股票比例不因不可動用現金而被誤算", () => {
    const first = baseSnapshot({
      date: "2026-06-01",
      cashSources: [
        { id: "1", name: "活存", amount: 200000, restricted: false },
        { id: "2", name: "保證金", amount: 100000, restricted: true },
      ],
      twStockValue: 700000,
    });
    const last = { ...first, date: "2026-07-01" };
    const prompt = buildPeriodicReviewPrompt({
      currentDate: "2026-07-13",
      draft: last,
      metrics: calculateMetrics(last),
      recentSnapshots: [first, last],
    });

    // 現金 20%、股票 70%（不是 100% − 20% = 80%）
    expect(prompt).toContain(
      "資產配置（現金／股票）：20.0%／70.0% → 20.0%／70.0%"
    );
  });
});

describe("提示詞：金融負債比／含償還本金的儲蓄率／可投資淨資產進度", () => {
  // PRD 第 9 節 #60k：現金 100 萬＋台股 300 萬＋不動產 1,200 萬；房貸 600 萬＋信貸 40 萬＋質押 120 萬
  const draft = baseSnapshot({
    cashSources: [
      { id: "1", name: "活存", amount: 1000000, restricted: false },
    ],
    twStockValue: 3000000,
    realEstateValue: 12000000,
    debts: [
      {
        id: "d1",
        name: "房貸",
        category: "房貸",
        principal: 6000000,
        annualRate: 2.4,
        remainingMonths: 240,
        repaymentMethod: "amortizing",
        collateralValue: 0,
      },
      {
        id: "d2",
        name: "信貸",
        category: "信貸",
        principal: 400000,
        annualRate: 0,
        remainingMonths: 0,
        repaymentMethod: "amortizing",
        collateralValue: 0,
      },
      {
        id: "d3",
        name: "質押",
        category: "質押",
        principal: 1200000,
        annualRate: 0,
        remainingMonths: 12,
        repaymentMethod: "interestOnly",
        collateralValue: 2400000,
      },
    ],
    incomeSources: [{ id: "i1", name: "薪資", amount: 100000 }],
    monthlyExpense: 40000,
    targetNetWorth: 20000000,
  });
  const params = {
    currentDate: "2026-07-13",
    draft,
    metrics: calculateMetrics(draft),
    recentSnapshots: [],
  };

  it("財務健康檢查：今日財務總覽列出三項對照指標", () => {
    const prompt = buildFinancePrompt(params);

    expect(prompt).toContain("- 負債比：47.5%（負債偏高（需注意調控））");
    expect(prompt).toContain(
      "- 金融負債比：40.0%（負債偏高（需注意調控）；房貸以外的負債 $1,600,000 ÷ 金融資產 $4,000,000，不含不動產與房貸）"
    );
    expect(prompt).toContain("- 儲蓄率：28.5%（高儲蓄率）");
    expect(prompt).toContain(
      "- 含償還本金的儲蓄率：48.0%（本月償還負債本金 $19,503，還本金不減少淨資產）"
    );
    expect(prompt).toContain(
      "- FIRE／淨資產目標進度：42.0%（目標 $20,000,000）"
    );
    expect(prompt).toContain(
      "- 可投資淨資產目標進度：12.0%（可投資淨資產 $2,400,000＝金融資產 − 房貸以外的負債，不含不動產與房貸）"
    );
  });

  it("投資方向評估：負債比之後列出金融負債比，不含儲蓄率與目標進度", () => {
    const prompt = buildInvestmentDirectionPrompt(params);

    expect(prompt).toContain("- 金融負債比：40.0%");
    expect(prompt).not.toContain("含償還本金的儲蓄率");
    expect(prompt).not.toContain("可投資淨資產目標進度");
  });

  it("沒有不動產、房貸與攤還中的負債時，三行都不輸出", () => {
    const plain = baseSnapshot({
      cashSources: [
        { id: "1", name: "活存", amount: 1000000, restricted: false },
      ],
      debts: [
        {
          id: "d1",
          name: "質押",
          category: "質押",
          principal: 300000,
          annualRate: 2.4,
          remainingMonths: 12,
          repaymentMethod: "interestOnly",
          collateralValue: 600000,
        },
      ],
      incomeSources: [{ id: "i1", name: "薪資", amount: 60000 }],
      monthlyExpense: 30000,
      targetNetWorth: 2000000,
    });
    const plainParams = {
      currentDate: "2026-07-13",
      draft: plain,
      metrics: calculateMetrics(plain),
      recentSnapshots: [],
    };

    for (const prompt of [
      buildFinancePrompt(plainParams),
      buildInvestmentDirectionPrompt(plainParams),
    ]) {
      expect(prompt).toContain("- 負債比：30.0%");
      expect(prompt).not.toContain("金融負債比");
      expect(prompt).not.toContain("含償還本金的儲蓄率");
      expect(prompt).not.toContain("可投資淨資產目標進度");
    }
  });

  it("未設定目標時不輸出可投資淨資產目標進度", () => {
    const noTarget = { ...draft, targetNetWorth: 0 };
    const prompt = buildFinancePrompt({
      ...params,
      draft: noTarget,
      metrics: calculateMetrics(noTarget),
    });

    expect(prompt).toContain("- FIRE／淨資產目標進度：尚未設定目標淨資產");
    expect(prompt).not.toContain("可投資淨資產目標進度");
    // 金融負債比與目標無關，照常輸出
    expect(prompt).toContain("- 金融負債比：40.0%");
  });
});
