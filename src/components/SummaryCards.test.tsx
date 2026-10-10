import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { calculateMetrics } from "@/lib/calculations";
import { SummaryCards } from "@/components/SummaryCards";
import type { SummaryBaseline } from "@/components/SummaryCards";
import type { Debt } from "@/types/schema";

function baseDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "d1",
    name: "房貸",
    category: "房貸",
    principal: 0,
    annualRate: 0,
    remainingMonths: 0,
    repaymentMethod: "amortizing",
    collateralValue: 0,
    ...overrides,
  };
}

function baseSnapshotInput(
  overrides: Partial<Parameters<typeof calculateMetrics>[0]> = {}
) {
  return {
    cashSources: [],
    twStockValue: 0,
    usStockValue: 0,
    usStockCurrency: "USD" as const,
    exchangeRate: 0,
    realEstateValue: 0,
    debts: [] as Debt[],
    incomeSources: [],
    monthlyExpense: 0,
    recurringInvestments: [],
    targetNetWorth: 0,
    ...overrides,
  } satisfies Parameters<typeof calculateMetrics>[0];
}

describe("SummaryCards", () => {
  it("點擊總資產公式說明 icon 會顯示現金加股票市值的計算過程", () => {
    const input = baseSnapshotInput({
      cashSources: [
        { id: "1", name: "現金", amount: 350000, restricted: false },
      ],
      twStockValue: 650000,
    });
    render(
      <SummaryCards metrics={calculateMetrics(input)} debts={input.debts} />
    );

    fireEvent.click(screen.getByLabelText("總資產計算公式說明"));

    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "$350,000 + $650,000 + $0 = $1,000,000"
    );
  });

  // PRD 第 9 節 #41：不動產市值計入總資產與淨資產
  it("填入不動產市值後，總資產公式說明包含不動產，淨資產與總資產都隨之增加", () => {
    const input = baseSnapshotInput({
      cashSources: [
        { id: "1", name: "現金", amount: 200000, restricted: false },
      ],
      twStockValue: 300000,
      realEstateValue: 10000000,
      debts: [baseDebt({ principal: 6000000 })],
    });
    render(
      <SummaryCards metrics={calculateMetrics(input)} debts={input.debts} />
    );

    expect(screen.getByTestId("total-assets")).toHaveTextContent("$10,500,000");
    expect(screen.getByTestId("net-worth")).toHaveTextContent("$4,500,000");

    fireEvent.click(screen.getByLabelText("總資產計算公式說明"));
    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "$200,000 + $300,000 + $10,000,000 = $10,500,000"
    );
  });

  it("點擊總負債公式說明 icon 會列出每筆負債本金", () => {
    const input = baseSnapshotInput({
      debts: [
        baseDebt({ id: "d1", name: "房貸", principal: 300000 }),
        baseDebt({ id: "d2", name: "信貸", principal: 15000 }),
      ],
    });
    render(
      <SummaryCards metrics={calculateMetrics(input)} debts={input.debts} />
    );

    fireEvent.click(screen.getByLabelText("總負債計算公式說明"));

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent(
      "$300,000（房貸） + $15,000（信貸） = $315,000"
    );
  });

  it("點擊淨資產公式說明 icon 會顯示總資產減總負債的計算過程", () => {
    const input = baseSnapshotInput({
      cashSources: [
        { id: "1", name: "現金", amount: 1000000, restricted: false },
      ],
      debts: [baseDebt({ principal: 300000 })],
    });
    render(
      <SummaryCards metrics={calculateMetrics(input)} debts={input.debts} />
    );

    fireEvent.click(screen.getByLabelText("個人淨資產計算公式說明"));

    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "$1,000,000 − $300,000 = $700,000"
    );
  });
});

// PRD 4.2「總覽卡增減比對」、第 9 節 #69a～#69e
describe("SummaryCards：與上一筆快照的增減", () => {
  // 總資產 1,050,000、總負債 400,000、淨資產 650,000
  const input = baseSnapshotInput({
    cashSources: [
      { id: "1", name: "現金", amount: 1050000, restricted: false },
    ],
    debts: [baseDebt({ principal: 400000 })],
  });
  const previous: SummaryBaseline = {
    date: "2026-09-30",
    totalAssets: 1000000,
    totalLiabilities: 400000,
    netWorth: 600000,
  };

  function renderCards(baseline?: SummaryBaseline | null) {
    render(
      <SummaryCards
        metrics={calculateMetrics(input)}
        debts={input.debts}
        previous={baseline}
      />
    );
  }

  it("三張卡各顯示基準日期與增減金額、百分比；數值相同顯示「持平」", () => {
    renderCards(previous);

    const assets = screen.getByTestId("total-assets-delta");
    expect(assets).toHaveTextContent("較 2026-09-30");
    expect(assets).toHaveTextContent("▲ $50,000 (+5.0%)");
    expect(screen.getByTestId("net-worth-delta")).toHaveTextContent(
      "▲ $50,000 (+8.3%)"
    );
    const liabilities = screen.getByTestId("total-liabilities-delta");
    expect(liabilities).toHaveTextContent("較 2026-09-30");
    expect(liabilities).toHaveTextContent("持平");
  });

  it("減少時以 ▼ 與負的百分比呈現", () => {
    renderCards({
      ...previous,
      totalAssets: 1100000,
      totalLiabilities: 500000,
    });

    expect(screen.getByTestId("total-assets-delta")).toHaveTextContent(
      "▼ $50,000 (-4.5%)"
    );
    expect(screen.getByTestId("total-liabilities-delta")).toHaveTextContent(
      "▼ $100,000 (-20.0%)"
    );
  });

  it("基準值 ≤ 0 時只顯示增減金額，不顯示百分比", () => {
    renderCards({ ...previous, totalLiabilities: 0, netWorth: -100000 });

    const liabilities = screen.getByTestId("total-liabilities-delta");
    expect(liabilities).toHaveTextContent("▲ $400,000");
    expect(liabilities).not.toHaveTextContent("%");
    const netWorth = screen.getByTestId("net-worth-delta");
    expect(netWorth).toHaveTextContent("▲ $750,000");
    expect(netWorth).not.toHaveTextContent("%");
  });

  it("不足 1 元的差異顯示「持平」，不出現「▲ $0」", () => {
    renderCards({ ...previous, totalAssets: 1049999.6 });

    expect(screen.getByTestId("total-assets-delta")).toHaveTextContent("持平");
  });

  it("沒有更早的快照時，三張卡都不顯示增減行", () => {
    renderCards(null);

    expect(screen.getByTestId("total-assets")).toHaveTextContent("$1,050,000");
    for (const testId of [
      "total-assets-delta",
      "total-liabilities-delta",
      "net-worth-delta",
    ]) {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    }
  });
});
