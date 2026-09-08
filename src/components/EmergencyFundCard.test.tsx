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
        totalCash={150000}
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
        totalCash={160200}
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
        totalCash={300000}
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
        totalCash={150000}
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
        totalCash={300000}
        monthlyExpense={0}
        totalMonthlyDebtPayment={0}
      />
    );

    fireEvent.click(screen.getByLabelText("緊急預備金月數計算公式說明"));

    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "$300,000 ÷ $0 = ∞（無需求）"
    );
  });
});
