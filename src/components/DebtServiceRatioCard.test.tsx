import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DebtServiceRatioCard } from "@/components/DebtServiceRatioCard";
import type { DebtServiceRatioStatus } from "@/types/schema";

// PRD 5.2b 節、第 9 節 #61a–#61h：償債負擔率卡
describe("DebtServiceRatioCard", () => {
  // PRD 第 7 節無障礙規範：狀態不得只靠顏色，必須同時顯示文字標籤
  it.each([
    { status: "no-payment" as DebtServiceRatioStatus, label: "無還款負擔" },
    { status: "comfortable" as DebtServiceRatioStatus, label: "負擔輕鬆" },
    { status: "heavy" as DebtServiceRatioStatus, label: "負擔偏重" },
    { status: "excessive" as DebtServiceRatioStatus, label: "負擔過重" },
    { status: "no-income" as DebtServiceRatioStatus, label: "無收入可負擔" },
  ])("狀態 $status 會顯示對應文字標籤 $label", ({ status, label }) => {
    render(
      <DebtServiceRatioCard
        ratio={status === "no-income" ? null : 20}
        status={status}
        totalMonthlyDebtPayment={12000}
        totalIncome={60000}
      />
    );
    expect(screen.getByTestId("debt-service-ratio-status")).toHaveTextContent(
      label
    );
  });

  it("顯示百分比數值，進度條寬度等於比率", () => {
    render(
      <DebtServiceRatioCard
        ratio={37.472}
        status="heavy"
        totalMonthlyDebtPayment={25481}
        totalIncome={68000}
      />
    );
    expect(screen.getByTestId("debt-service-ratio-value")).toHaveTextContent(
      "37.5%"
    );
    expect(screen.getByTestId("debt-service-ratio-bar-fill")).toHaveStyle({
      width: "37.472%",
    });
  });

  it("沒有應還款時顯示 0.0%，進度條寬度為 0%", () => {
    render(
      <DebtServiceRatioCard
        ratio={0}
        status="no-payment"
        totalMonthlyDebtPayment={0}
        totalIncome={60000}
      />
    );
    expect(screen.getByTestId("debt-service-ratio-value")).toHaveTextContent(
      "0.0%"
    );
    expect(screen.getByTestId("debt-service-ratio-bar-fill")).toHaveStyle({
      width: "0%",
    });
  });

  it("超過 100% 時數值不封頂，進度條寬度夾在 100%", () => {
    render(
      <DebtServiceRatioCard
        ratio={120}
        status="excessive"
        totalMonthlyDebtPayment={12000}
        totalIncome={10000}
      />
    );
    expect(screen.getByTestId("debt-service-ratio-value")).toHaveTextContent(
      "120.0%"
    );
    expect(screen.getByTestId("debt-service-ratio-bar-fill")).toHaveStyle({
      width: "100%",
    });
  });

  it("總收入為 0 但有應還款時顯示「—」與無收入可負擔，進度條填滿", () => {
    render(
      <DebtServiceRatioCard
        ratio={null}
        status="no-income"
        totalMonthlyDebtPayment={12000}
        totalIncome={0}
      />
    );
    const value = screen.getByTestId("debt-service-ratio-value");
    expect(value).toHaveTextContent("—");
    expect(value.textContent).not.toMatch(/NaN|Infinity|%/);
    expect(screen.getByTestId("debt-service-ratio-status")).toHaveTextContent(
      "無收入可負擔"
    );
    expect(screen.getByTestId("debt-service-ratio-bar-fill")).toHaveStyle({
      width: "100%",
    });
  });

  it("點擊公式說明 icon 會顯示公式與代入實際數值的計算過程", () => {
    render(
      <DebtServiceRatioCard
        ratio={20}
        status="comfortable"
        totalMonthlyDebtPayment={12000}
        totalIncome={60000}
      />
    );

    fireEvent.click(screen.getByLabelText("償債負擔率計算公式說明"));

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent(
      "償債負擔率 = 本月應還款總額 ÷ 總收入 × 100%"
    );
    expect(content).toHaveTextContent("$12,000 ÷ $60,000 × 100% = 20.0%");
  });

  it("無法計算時，公式說明不代入出 NaN／Infinity", () => {
    render(
      <DebtServiceRatioCard
        ratio={null}
        status="no-income"
        totalMonthlyDebtPayment={12000}
        totalIncome={0}
      />
    );

    fireEvent.click(screen.getByLabelText("償債負擔率計算公式說明"));

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent("$12,000 ÷ $0：總收入為 0，無法計算");
    expect(content.textContent).not.toMatch(/NaN|Infinity/);
  });
});
