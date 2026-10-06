import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StressTestCard } from "@/components/StressTestCard";
import type { Debt } from "@/types/schema";
import { createEmptySnapshot } from "@/types/schema";

const base = createEmptySnapshot("2026-09-30");

function mortgage(principal: number): Debt {
  return {
    id: "m",
    name: "房貸",
    category: "房貸",
    principal,
    annualRate: 0,
    remainingMonths: 0,
    repaymentMethod: "amortizing",
    collateralValue: 0,
  };
}

function pledge(principal: number, collateralValue: number): Debt {
  return {
    id: "p",
    name: "股票質押",
    category: "質押",
    principal,
    annualRate: 3.5,
    remainingMonths: 12,
    repaymentMethod: "interestOnly",
    collateralValue,
  };
}

const withStocks = {
  ...base,
  cashSources: [{ id: "1", name: "現金", amount: 300000, restricted: false }],
  twStockValue: 400000,
  usStockValue: 300000,
  usStockCurrency: "TWD" as const,
  debts: [mortgage(400000)],
};

describe("StressTestCard", () => {
  // PRD 第 9 節 #44f：沒有股票時整區不顯示
  it("股票市值合計為 0 時不渲染任何內容", () => {
    const { container } = render(
      <StressTestCard
        snapshot={{
          ...base,
          cashSources: [
            { id: "1", name: "現金", amount: 100000, restricted: false },
          ],
        }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  // PRD 第 9 節 #44a：預設 −20%，同時只選一個
  it("預設選取 −20%，其餘情境未選取", () => {
    render(<StressTestCard snapshot={withStocks} />);

    expect(screen.getByRole("button", { name: "\u221220%" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "\u221210%" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "\u221230%" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  // PRD 第 9 節 #44：一般情境
  it("以「現況 → 情境」顯示股票市值、淨資產（含變動金額與百分比）與負債比", () => {
    render(<StressTestCard snapshot={withStocks} />);

    expect(screen.getByTestId("stress-test-stock")).toHaveTextContent(
      "$700,000 → $560,000"
    );
    expect(screen.getByTestId("stress-test-net-worth")).toHaveTextContent(
      "$600,000 → $460,000"
    );
    expect(
      screen.getByTestId("stress-test-net-worth-change")
    ).toHaveTextContent("-$140,000，-23.3%");
    expect(screen.getByTestId("stress-test-debt-ratio")).toHaveTextContent(
      "40.0% → 46.5%"
    );
    expect(screen.getByTestId("stress-test-debt-status")).toHaveTextContent(
      "負債偏高（需注意調控）"
    );
  });

  it("切換情境後，只有被點擊的按鈕為選取狀態，數字即時更新", () => {
    render(<StressTestCard snapshot={withStocks} />);

    fireEvent.click(screen.getByRole("button", { name: "\u221230%" }));

    expect(screen.getByRole("button", { name: "\u221230%" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "\u221220%" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByTestId("stress-test-stock")).toHaveTextContent(
      "$700,000 → $490,000"
    );

    fireEvent.click(screen.getByRole("button", { name: "\u221210%" }));

    expect(screen.getByTestId("stress-test-stock")).toHaveTextContent(
      "$700,000 → $630,000"
    );
  });

  it("情境淨資產為負數時，數字轉為紅色", () => {
    render(
      <StressTestCard
        snapshot={{
          ...base,
          twStockValue: 1000000,
          debts: [mortgage(900000)],
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "\u221230%" }));

    // 淨資產 100,000 → 1,000,000 × 0.7 − 900,000 = −200,000
    expect(screen.getByTestId("stress-test-net-worth")).toHaveClass(
      "text-rose-600"
    );
  });

  it("現況淨資產為 0 時，不顯示變動百分比", () => {
    render(
      <StressTestCard
        snapshot={{
          ...base,
          twStockValue: 100000,
          debts: [mortgage(100000)],
        }}
      />
    );

    expect(
      screen.getByTestId("stress-test-net-worth-change")
    ).not.toHaveTextContent("%");
  });

  // PRD 第 9 節 #44c／#44d：質押維持率
  describe("質押整戶維持率", () => {
    const pledged = {
      ...base,
      cashSources: [
        { id: "1", name: "現金", amount: 1000000, restricted: false },
      ],
      twStockValue: 1000000,
      debts: [pledge(500000, 800000)],
    };

    it("−20% 時維持率 160% → 128%，低於追繳線並顯示警示", () => {
      render(<StressTestCard snapshot={pledged} />);

      expect(screen.getByTestId("stress-test-pledge-ratio")).toHaveTextContent(
        "160.0% → 128.0%"
      );
      expect(screen.getByTestId("stress-test-pledge-status")).toHaveTextContent(
        "低於追繳線"
      );
      expect(
        screen.getByTestId("stress-test-margin-call-warning")
      ).toHaveTextContent("此情境下質押維持率將低於 130% 追繳線");
    });

    it("−10% 時維持率 144.0%，仍高於追繳線，不顯示警示", () => {
      render(<StressTestCard snapshot={pledged} />);

      fireEvent.click(screen.getByRole("button", { name: "\u221210%" }));

      expect(screen.getByTestId("stress-test-pledge-ratio")).toHaveTextContent(
        "160.0% → 144.0%"
      );
      expect(screen.getByTestId("stress-test-pledge-status")).toHaveTextContent(
        "維持率留意"
      );
      expect(
        screen.queryByTestId("stress-test-margin-call-warning")
      ).not.toBeInTheDocument();
    });

    // PRD 第 9 節 #44e
    it("沒有質押負債時，不顯示維持率行與警示", () => {
      render(<StressTestCard snapshot={withStocks} />);

      expect(
        screen.queryByTestId("stress-test-pledge-ratio")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("stress-test-margin-call-warning")
      ).not.toBeInTheDocument();
    });

    it("有質押負債但尚未填寫質押股票市值時，不顯示維持率行與警示，其餘指標正常", () => {
      render(
        <StressTestCard snapshot={{ ...pledged, debts: [pledge(500000, 0)] }} />
      );

      expect(
        screen.queryByTestId("stress-test-pledge-ratio")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("stress-test-margin-call-warning")
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("stress-test-net-worth")).not.toHaveTextContent(
        "NaN"
      );
    });
  });

  it("點擊公式說明 icon 會顯示情境公式與代入數值，並註明是簡化試算", () => {
    render(<StressTestCard snapshot={withStocks} />);

    fireEvent.click(screen.getByLabelText("壓力測試計算公式說明"));

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent("情境淨資產");
    expect(content).toHaveTextContent("$700,000 × (1 − 20%) = $560,000");
    expect(content).toHaveTextContent("簡化的即時試算");
  });

  // PRD 4.2「壓力測試臨界點」、5.9a 節、第 9 節 #44h～#44m
  describe("臨界點", () => {
    const pledged = {
      ...base,
      cashSources: [
        { id: "1", name: "現金", amount: 1000000, restricted: false },
      ],
      twStockValue: 1000000,
      debts: [pledge(500000, 800000)],
    };
    const itemTestIds = () =>
      within(screen.getByTestId("stress-breakpoints"))
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("data-testid"));

    // #44h
    it("已觸及的線置頂，其餘依跌幅由小到大列出「股票再下跌 X% → 事件」", () => {
      render(<StressTestCard snapshot={withStocks} />);

      expect(screen.getByTestId("stress-breakpoints")).toHaveTextContent(
        "臨界點"
      );
      expect(itemTestIds()).toEqual([
        "stress-breakpoint-debt-ratio-elevated",
        "stress-breakpoint-debt-ratio-high-risk",
        "stress-breakpoint-net-worth-zero",
      ]);
      expect(
        screen.getByTestId("stress-breakpoint-debt-ratio-elevated")
      ).toHaveTextContent("已觸及負債比已達 40% 以上");
      expect(
        screen.getByTestId("stress-breakpoint-debt-ratio-high-risk")
      ).toHaveTextContent(
        "股票再下跌 47.6% → 負債比升至 60%（再跌即進入「財務高風險」）"
      );
      expect(
        screen.getByTestId("stress-breakpoint-net-worth-zero")
      ).toHaveTextContent("股票再下跌 85.7% → 淨資產歸零");
    });

    // #44i／#44j
    it("質押追繳線顯示跌幅；股票跌到 0 也碰不到的線標示「不會觸及」並置底", () => {
      render(<StressTestCard snapshot={pledged} />);

      expect(itemTestIds()).toEqual([
        "stress-breakpoint-pledge-margin-call",
        "stress-breakpoint-debt-ratio-elevated",
        "stress-breakpoint-debt-ratio-high-risk",
        "stress-breakpoint-net-worth-zero",
      ]);
      expect(
        screen.getByTestId("stress-breakpoint-pledge-margin-call")
      ).toHaveTextContent("股票再下跌 18.8% → 質押維持率觸及 130% 追繳線");
      expect(
        screen.getByTestId("stress-breakpoint-debt-ratio-elevated")
      ).toHaveTextContent(
        "股票再下跌 75.0% → 負債比升至 40%（進入「負債偏高」）"
      );
      expect(
        screen.getByTestId("stress-breakpoint-debt-ratio-high-risk")
      ).toHaveTextContent("不會觸及負債比升至 60%");
      expect(
        screen.getByTestId("stress-breakpoint-net-worth-zero")
      ).toHaveTextContent("不會觸及淨資產歸零（股票跌到 0 也碰不到）");
    });

    it("已低於追繳線、淨資產為負時，皆以文字標示「已觸及」且不顯示跌幅", () => {
      render(
        <StressTestCard
          snapshot={{
            ...base,
            twStockValue: 1000000,
            debts: [pledge(1200000, 1000000)],
          }}
        />
      );

      const block = screen.getByTestId("stress-breakpoints");
      expect(within(block).getAllByText("已觸及")).toHaveLength(4);
      // 區塊說明文字本身含「股票再下跌」，所以只檢查清單
      expect(within(block).getByRole("list")).not.toHaveTextContent(
        /股票再下跌|%\s*→/
      );
      expect(
        screen.getByTestId("stress-breakpoint-pledge-margin-call")
      ).toHaveTextContent("已觸及質押維持率已在 130% 追繳線或以下");
      expect(
        screen.getByTestId("stress-breakpoint-net-worth-zero")
      ).toHaveTextContent("已觸及淨資產已歸零或為負數");
    });

    // #44k
    it("沒有質押負債或尚未填寫質押股票市值時，不顯示質押追繳線", () => {
      const { unmount } = render(<StressTestCard snapshot={withStocks} />);
      expect(
        screen.queryByTestId("stress-breakpoint-pledge-margin-call")
      ).not.toBeInTheDocument();
      unmount();

      render(
        <StressTestCard snapshot={{ ...pledged, debts: [pledge(500000, 0)] }} />
      );
      expect(
        screen.queryByTestId("stress-breakpoint-pledge-margin-call")
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId("stress-breakpoint-debt-ratio-elevated")
      ).toBeInTheDocument();
      expect(screen.getByTestId("stress-breakpoints")).not.toHaveTextContent(
        /NaN|Infinity/
      );
    });

    it("總負債為 0 時不顯示兩條負債比線，只剩淨資產歸零", () => {
      render(<StressTestCard snapshot={{ ...withStocks, debts: [] }} />);

      expect(itemTestIds()).toEqual(["stress-breakpoint-net-worth-zero"]);
      expect(
        screen.getByTestId("stress-breakpoint-net-worth-zero")
      ).toHaveTextContent("不會觸及淨資產歸零");
    });

    it("極小的跌幅顯示「不到 0.1%」，不顯示成 0.0%", () => {
      render(
        <StressTestCard
          snapshot={{
            ...base,
            twStockValue: 1000000,
            debts: [mortgage(399900)],
          }}
        />
      );

      // 40% 線：(1,000,000 − 999,750) ÷ 1,000,000 = 0.025%
      expect(
        screen.getByTestId("stress-breakpoint-debt-ratio-elevated")
      ).toHaveTextContent("股票再下跌 不到 0.1% → 負債比升至 40%");
    });

    // #44m
    it("切換情境不影響臨界點", () => {
      render(<StressTestCard snapshot={pledged} />);
      const before = screen.getByTestId("stress-breakpoints").textContent;

      fireEvent.click(screen.getByRole("button", { name: "−30%" }));
      expect(screen.getByTestId("stress-test-stock")).toHaveTextContent(
        "$1,000,000 → $700,000"
      );
      expect(screen.getByTestId("stress-breakpoints").textContent).toBe(before);

      fireEvent.click(screen.getByRole("button", { name: "−10%" }));
      expect(screen.getByTestId("stress-breakpoints").textContent).toBe(before);
    });

    it("公式說明列出臨界點的算法與代入數值（只列有算出跌幅的線）", () => {
      render(<StressTestCard snapshot={withStocks} />);

      fireEvent.click(screen.getByLabelText("壓力測試計算公式說明"));

      const content = screen.getByTestId("formula-info-content");
      expect(content).toHaveTextContent(
        "負債比升至 T% = (總資產 − 總負債 ÷ T%) ÷ 股票市值"
      );
      expect(content).toHaveTextContent("淨資產歸零 = 淨資產 ÷ 股票市值");
      expect(content).toHaveTextContent("追繳線 = 1 − 130% ÷ 質押維持率");
      expect(content).toHaveTextContent(
        "負債比 60%：($1,000,000 − $400,000 ÷ 60%) ÷ $700,000 = 47.6%"
      );
      expect(content).toHaveTextContent(
        "淨資產歸零：$600,000 ÷ $700,000 = 85.7%"
      );
      // 40% 線已觸及，沒有跌幅可代入
      expect(content).not.toHaveTextContent("負債比 40%：");
      expect(content).toHaveTextContent("不會觸及");
    });

    it("公式說明：質押追繳線代入現況維持率", () => {
      render(<StressTestCard snapshot={pledged} />);

      fireEvent.click(screen.getByLabelText("壓力測試計算公式說明"));

      expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
        "追繳線：1 − 130% ÷ 160.0% = 18.8%"
      );
    });
  });

  it("卡片下方註明僅為簡化的即時試算", () => {
    render(<StressTestCard snapshot={withStocks} />);
    expect(
      screen.getByText(/僅為簡化的即時試算，未考量匯率變動/)
    ).toBeInTheDocument();
  });
});
