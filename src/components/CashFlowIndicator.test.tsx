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
        recurringInvestment={0}
        cashFlowAfterInvestment={20519}
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
        recurringInvestment={0}
        cashFlowAfterInvestment={-5000}
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
        recurringInvestment={0}
        cashFlowAfterInvestment={20519}
      />
    );

    fireEvent.click(screen.getByLabelText("本月預估現金流計算公式說明"));

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent("$68,000 − $22,000 − $25,481 = $20,519");
    expect(content).not.toHaveTextContent("定期定額");
  });

  // PRD 第 9 節 #62e：沒有定期定額時不顯示「定期定額後剩餘」
  it("定期定額合計為 0 時不顯示定期定額後剩餘", () => {
    render(
      <CashFlowIndicator
        cashFlow={20519}
        totalIncome={68000}
        monthlyExpense={22000}
        totalMonthlyDebtPayment={25481}
        recurringInvestment={0}
        cashFlowAfterInvestment={20519}
      />
    );

    expect(
      screen.queryByTestId("cash-flow-after-investment")
    ).not.toBeInTheDocument();
  });

  // PRD 第 9 節 #62c：主數字與燈號仍以現金流為準，下方另列定期定額後剩餘
  it("有定期定額時於燈號下方另列剩餘，主數字與標籤不變", () => {
    render(
      <CashFlowIndicator
        cashFlow={20519}
        totalIncome={68000}
        monthlyExpense={22000}
        totalMonthlyDebtPayment={25481}
        recurringInvestment={15000}
        cashFlowAfterInvestment={5519}
      />
    );

    expect(screen.getByTestId("cash-flow-value")).toHaveTextContent("$20,519");
    expect(screen.getByText("收支為正")).toBeInTheDocument();
    expect(screen.getByTestId("cash-flow-after-investment")).toHaveTextContent(
      "定期定額後剩餘 $5,519（定期定額 $15,000）"
    );
  });

  // PRD 第 9 節 #62d：剩餘為負時以文字標示，不只靠顏色；現金流本身仍為正
  it("定期定額後剩餘為負時加註「不足以支應」，現金流標籤仍為收支為正", () => {
    render(
      <CashFlowIndicator
        cashFlow={20519}
        totalIncome={68000}
        monthlyExpense={22000}
        totalMonthlyDebtPayment={25481}
        recurringInvestment={30000}
        cashFlowAfterInvestment={-9481}
      />
    );

    expect(screen.getByTestId("cash-flow-after-investment")).toHaveTextContent(
      "定期定額後剩餘 -$9,481（定期定額 $30,000，不足以支應）"
    );
    expect(screen.getByText("收支為正")).toBeInTheDocument();
    expect(screen.queryByText("入不敷出")).not.toBeInTheDocument();
  });

  // PRD 第 9 節 #62f
  it("有定期定額時公式說明一併列出定期定額後剩餘的算式", () => {
    render(
      <CashFlowIndicator
        cashFlow={20519}
        totalIncome={68000}
        monthlyExpense={22000}
        totalMonthlyDebtPayment={25481}
        recurringInvestment={15000}
        cashFlowAfterInvestment={5519}
      />
    );

    fireEvent.click(screen.getByLabelText("本月預估現金流計算公式說明"));

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent("$68,000 − $22,000 − $25,481 = $20,519");
    expect(content).toHaveTextContent("定期定額後剩餘 = 現金流 − 定期定額合計");
    expect(content).toHaveTextContent("$20,519 − $15,000 = $5,519");
  });
});
