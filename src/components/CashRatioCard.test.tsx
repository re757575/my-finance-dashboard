import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CashRatioCard } from "@/components/CashRatioCard";

describe("CashRatioCard", () => {
  it("顯示百分比數值", () => {
    render(
      <CashRatioCard ratio={42.5} totalCash={425000} totalAssets={1000000} />
    );
    expect(screen.getByTestId("cash-ratio-value")).toHaveTextContent("42.5%");
  });

  it("現金比例超過 100% 時，進度條寬度仍夾在 100%", () => {
    render(
      <CashRatioCard ratio={150} totalCash={1500000} totalAssets={1000000} />
    );
    expect(screen.getByTestId("cash-ratio-bar-fill")).toHaveStyle({
      width: "100%",
    });
  });

  it("現金比例為負數時，進度條寬度夾在 0%", () => {
    render(
      <CashRatioCard ratio={-10} totalCash={-100000} totalAssets={1000000} />
    );
    expect(screen.getByTestId("cash-ratio-bar-fill")).toHaveStyle({
      width: "0%",
    });
  });

  it("點擊公式說明 icon 會顯示代入實際數值的計算過程", () => {
    render(
      <CashRatioCard ratio={35} totalCash={350000} totalAssets={1000000} />
    );

    fireEvent.click(screen.getByLabelText("現金比例計算公式說明"));

    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "$350,000 ÷ $1,000,000 × 100% = 35.0%"
    );
  });
});
