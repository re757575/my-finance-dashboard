import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmergencyFundCard } from "@/components/EmergencyFundCard";
import type { EmergencyFundStatus } from "@/types/schema";

describe("EmergencyFundCard", () => {
  // PRD 第 7 節無障礙規範：狀態不得只靠顏色，必須同時顯示文字標籤
  it.each([
    { status: "no-need" as EmergencyFundStatus, label: "無需求" },
    { status: "insufficient" as EmergencyFundStatus, label: "預備金不足" },
    { status: "basic" as EmergencyFundStatus, label: "基本安全" },
    { status: "sufficient" as EmergencyFundStatus, label: "預備充足" },
  ])("狀態 $status 會顯示對應文字標籤 $label", ({ status, label }) => {
    render(
      <EmergencyFundCard
        months={5}
        status={status}
        liquidCash={150000}
        restrictedCash={0}
        monthlyExpense={20000}
        totalMonthlyDebtPayment={10000}
      />
    );
    expect(screen.getByTestId("emergency-fund-status")).toHaveTextContent(
      label
    );
  });

  it("顯示月數到小數點後 1 位", () => {
    render(
      <EmergencyFundCard
        months={5.34}
        status="basic"
        liquidCash={160200}
        restrictedCash={0}
        monthlyExpense={20000}
        totalMonthlyDebtPayment={10000}
      />
    );
    expect(screen.getByTestId("emergency-fund-value")).toHaveTextContent(
      "5.3 個月"
    );
  });

  // PRD 第 9 節 #27a：分母為 0 時顯示「∞」
  it("月數為 null 時顯示「∞」", () => {
    render(
      <EmergencyFundCard
        months={null}
        status="no-need"
        liquidCash={300000}
        restrictedCash={0}
        monthlyExpense={0}
        totalMonthlyDebtPayment={0}
      />
    );
    expect(screen.getByTestId("emergency-fund-value")).toHaveTextContent("∞");
  });

  it("點擊公式說明 icon 會顯示代入實際數值的計算過程", () => {
    render(
      <EmergencyFundCard
        months={5}
        status="basic"
        liquidCash={150000}
        restrictedCash={0}
        monthlyExpense={20000}
        totalMonthlyDebtPayment={10000}
      />
    );

    fireEvent.click(screen.getByLabelText("緊急預備金月數計算公式說明"));

    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "$150,000 ÷ ($20,000 + $10,000) = 5.0 個月"
    );
  });

  it("分母為 0 時，公式說明顯示「∞」", () => {
    render(
      <EmergencyFundCard
        months={null}
        status="no-need"
        liquidCash={300000}
        restrictedCash={0}
        monthlyExpense={0}
        totalMonthlyDebtPayment={0}
      />
    );

    fireEvent.click(screen.getByLabelText("緊急預備金月數計算公式說明"));

    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "$300,000 ÷ $0 = ∞（無需求）"
    );
  });

  // PRD 第 9 節 #40：不可動用現金不計入分子，卡片以小字註記
  it("存在不可動用現金時，顯示註記；為 0 時不顯示", () => {
    const { rerender } = render(
      <EmergencyFundCard
        months={6.7}
        status="sufficient"
        liquidCash={200000}
        restrictedCash={100000}
        monthlyExpense={20000}
        totalMonthlyDebtPayment={10000}
      />
    );
    expect(
      screen.getByTestId("emergency-fund-restricted-note")
    ).toHaveTextContent("不含不可動用現金 $100,000");

    rerender(
      <EmergencyFundCard
        months={6.7}
        status="sufficient"
        liquidCash={200000}
        restrictedCash={0}
        monthlyExpense={20000}
        totalMonthlyDebtPayment={10000}
      />
    );
    expect(
      screen.queryByTestId("emergency-fund-restricted-note")
    ).not.toBeInTheDocument();
  });

  it("公式說明的分子為可動用現金", () => {
    render(
      <EmergencyFundCard
        months={6.7}
        status="sufficient"
        liquidCash={200000}
        restrictedCash={100000}
        monthlyExpense={20000}
        totalMonthlyDebtPayment={10000}
      />
    );

    fireEvent.click(screen.getByLabelText("緊急預備金月數計算公式說明"));

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent("可動用現金 ÷");
    expect(content).toHaveTextContent("$200,000 ÷ ($20,000 + $10,000)");
  });
});
