import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { calculateMetrics } from "@/lib/calculations";
import { SummaryCards } from "@/components/SummaryCards";
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
    debts: [] as Debt[],
    incomeSources: [],
    monthlyExpense: 0,
    targetNetWorth: 0,
    ...overrides,
  } satisfies Parameters<typeof calculateMetrics>[0];
}

describe("SummaryCards", () => {
  it("點擊總資產公式說明 icon 會顯示現金加股票市值的計算過程", () => {
    const input = baseSnapshotInput({
      cashSources: [{ id: "1", name: "現金", amount: 350000 }],
      twStockValue: 650000,
    });
    render(
      <SummaryCards metrics={calculateMetrics(input)} debts={input.debts} />
    );

    fireEvent.click(screen.getByLabelText("總資產計算公式說明"));

    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "$350,000 + $650,000 = $1,000,000"
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
      cashSources: [{ id: "1", name: "現金", amount: 1000000 }],
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
