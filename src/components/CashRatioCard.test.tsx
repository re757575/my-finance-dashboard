import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CashRatioCard } from "@/components/CashRatioCard";

describe("CashRatioCard", () => {
  it("顯示百分比數值", () => {
    render(<CashRatioCard ratio={42.5} />);
    expect(screen.getByTestId("cash-ratio-value")).toHaveTextContent("42.5%");
  });

  it("現金比例超過 100% 時，進度條寬度仍夾在 100%", () => {
    render(<CashRatioCard ratio={150} />);
    expect(screen.getByTestId("cash-ratio-bar-fill")).toHaveStyle({
      width: "100%",
    });
  });

  it("現金比例為負數時，進度條寬度夾在 0%", () => {
    render(<CashRatioCard ratio={-10} />);
    expect(screen.getByTestId("cash-ratio-bar-fill")).toHaveStyle({
      width: "0%",
    });
  });
});
