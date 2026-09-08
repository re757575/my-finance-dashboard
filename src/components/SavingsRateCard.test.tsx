import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SavingsRateCard } from "@/components/SavingsRateCard";
import type { SavingsRateStatus } from "@/types/schema";

describe("SavingsRateCard", () => {
  // PRD 第 7 節無障礙規範：狀態不得只靠顏色，必須同時顯示文字標籤
  it.each([
    { status: "negative" as SavingsRateStatus, label: "入不敷出" },
    { status: "low" as SavingsRateStatus, label: "儲蓄偏低" },
    { status: "healthy" as SavingsRateStatus, label: "儲蓄健康" },
    { status: "high" as SavingsRateStatus, label: "高儲蓄率" },
  ])("狀態 $status 會顯示對應文字標籤 $label", ({ status, label }) => {
    render(
      <SavingsRateCard
        rate={15}
        status={status}
        cashFlow={9000}
        totalIncome={60000}
      />
    );
    expect(screen.getByTestId("savings-rate-status")).toHaveTextContent(label);
  });

  it("顯示百分比數值", () => {
    render(
      <SavingsRateCard
        rate={30.25}
        status="high"
        cashFlow={18150}
        totalIncome={60000}
      />
    );
    expect(screen.getByTestId("savings-rate-value")).toHaveTextContent("30.3%");
  });

  it("負儲蓄率時，進度條寬度夾在 0%", () => {
    render(
      <SavingsRateCard
        rate={-20}
        status="negative"
        cashFlow={-12000}
        totalIncome={60000}
      />
    );
    expect(screen.getByTestId("savings-rate-bar-fill")).toHaveStyle({
      width: "0%",
    });
  });

  it("點擊公式說明 icon 會顯示代入實際數值的計算過程", () => {
    render(
      <SavingsRateCard
        rate={30}
        status="high"
        cashFlow={18000}
        totalIncome={60000}
      />
    );

    fireEvent.click(screen.getByLabelText("儲蓄率計算公式說明"));

    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "$18,000 ÷ $60,000 × 100% = 30.0%"
    );
  });
});
