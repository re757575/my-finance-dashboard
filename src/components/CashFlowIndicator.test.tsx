import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CashFlowIndicator } from "@/components/CashFlowIndicator";

describe("CashFlowIndicator", () => {
  it("現金流為正時顯示「收支為正」", () => {
    render(
      <CashFlowIndicator
        cashFlow={20519}
        totalIncome={68000}
        monthlyExpense={22000}
        totalMonthlyDebtPayment={25481}
      />
    );
    expect(screen.getByTestId("cash-flow-value")).toHaveTextContent("$20,519");
    expect(screen.getByText("收支為正")).toBeInTheDocument();
  });

  it("現金流為負時顯示「入不敷出」", () => {
    render(
      <CashFlowIndicator
        cashFlow={-5000}
        totalIncome={20000}
        monthlyExpense={15000}
        totalMonthlyDebtPayment={10000}
      />
    );
    expect(screen.getByText("入不敷出")).toBeInTheDocument();
  });

  it("點擊公式說明 icon 會顯示代入實際數值的計算過程", () => {
    render(
      <CashFlowIndicator
        cashFlow={20519}
        totalIncome={68000}
        monthlyExpense={22000}
        totalMonthlyDebtPayment={25481}
      />
    );

    fireEvent.click(screen.getByLabelText("本月預估現金流計算公式說明"));

    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "$68,000 − $22,000 − $25,481 = $20,519"
    );
  });
});
