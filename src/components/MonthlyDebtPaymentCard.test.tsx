import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonthlyDebtPaymentCard } from "@/components/MonthlyDebtPaymentCard";
import type { Debt } from "@/types/schema";

function baseDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "d1",
    name: "",
    category: "信貸",
    principal: 0,
    annualRate: 0,
    remainingMonths: 0,
    repaymentMethod: "amortizing",
    ...overrides,
  };
}

describe("MonthlyDebtPaymentCard", () => {
  it("顯示本月應還款總額", () => {
    render(<MonthlyDebtPaymentCard amount={15319} debts={[]} />);
    expect(screen.getByTestId("total-monthly-debt-payment")).toHaveTextContent(
      "$15,319"
    );
  });

  it("負債清單為空時，公式說明顯示尚無負債", () => {
    render(<MonthlyDebtPaymentCard amount={0} debts={[]} />);

    fireEvent.click(screen.getByLabelText("本月應還款總額計算公式說明"));

    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "尚無負債，本月應還款總額為 $0"
    );
  });

  it("點擊公式說明 icon 會列出每筆負債的每月應還款金額", () => {
    render(
      <MonthlyDebtPaymentCard
        amount={1458}
        debts={[
          baseDebt({
            id: "d1",
            name: "股票質押",
            principal: 500000,
            annualRate: 3.5,
            remainingMonths: 12,
            repaymentMethod: "interestOnly",
          }),
        ]}
      />
    );

    fireEvent.click(screen.getByLabelText("本月應還款總額計算公式說明"));

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent("$1,458（股票質押）");
    expect(content).toHaveTextContent("$1,458");
  });
});
