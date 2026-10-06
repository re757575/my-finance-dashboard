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
        principalRepayment={0}
        rateWithPrincipal={15}
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
        principalRepayment={0}
        rateWithPrincipal={30.25}
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
        principalRepayment={0}
        rateWithPrincipal={-20}
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
        principalRepayment={0}
        rateWithPrincipal={30}
      />
    );

    fireEvent.click(screen.getByLabelText("儲蓄率計算公式說明"));

    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "$18,000 ÷ $60,000 × 100% = 30.0%"
    );
  });

  // PRD 5.6 節、第 9 節 #60e–#60f：含償還本金的儲蓄率
  describe("含償還本金的儲蓄率", () => {
    it("本月有償還本金時另列一行，主數字與燈號仍為現金基礎的儲蓄率", () => {
      render(
        <SavingsRateCard
          rate={8.5}
          status="low"
          cashFlow={8500}
          totalIncome={100000}
          principalRepayment={19500}
          rateWithPrincipal={28}
        />
      );

      expect(screen.getByTestId("savings-rate-value")).toHaveTextContent(
        "8.5%"
      );
      expect(screen.getByTestId("savings-rate-status")).toHaveTextContent(
        "儲蓄偏低"
      );
      expect(
        screen.getByTestId("savings-rate-with-principal")
      ).toHaveTextContent("含償還本金 28.0%（本月還本 $19,500）");
    });

    it("本月沒有償還本金時不顯示", () => {
      render(
        <SavingsRateCard
          rate={30}
          status="high"
          cashFlow={18000}
          totalIncome={60000}
          principalRepayment={0}
          rateWithPrincipal={30}
        />
      );

      expect(
        screen.queryByTestId("savings-rate-with-principal")
      ).not.toBeInTheDocument();
    });

    it("顯示該行時，公式說明同時列出兩者的代入數值", () => {
      render(
        <SavingsRateCard
          rate={8.5}
          status="low"
          cashFlow={8500}
          totalIncome={100000}
          principalRepayment={19500}
          rateWithPrincipal={28}
        />
      );

      fireEvent.click(screen.getByLabelText("儲蓄率計算公式說明"));

      const content = screen.getByTestId("formula-info-content");
      expect(content).toHaveTextContent("$8,500 ÷ $100,000 × 100% = 8.5%");
      expect(content).toHaveTextContent(
        "($8,500 + $19,500) ÷ $100,000 × 100% = 28.0%"
      );
    });
  });
});
