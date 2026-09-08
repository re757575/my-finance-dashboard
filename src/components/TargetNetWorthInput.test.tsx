import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TargetNetWorthInput } from "@/components/TargetNetWorthInput";

describe("TargetNetWorthInput", () => {
  it("顯示「使用建議值」按鈕，金額為本月支出 × 12 × 25", () => {
    render(
      <TargetNetWorthInput
        value={0}
        monthlyExpense={30000}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "使用建議值 $9,000,000" })
    ).toBeInTheDocument();
  });

  it("點擊「使用建議值」按鈕會呼叫 onChange 帶入建議值", () => {
    const onChange = vi.fn();
    render(
      <TargetNetWorthInput
        value={0}
        monthlyExpense={30000}
        onChange={onChange}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "使用建議值 $9,000,000" })
    );

    expect(onChange).toHaveBeenCalledWith(9000000);
  });

  // PRD 4.2 節：本月支出為 0 時建議值也是 0，不顯示無意義的按鈕
  it("本月支出為 0 時，不顯示「使用建議值」按鈕", () => {
    render(
      <TargetNetWorthInput value={0} monthlyExpense={0} onChange={vi.fn()} />
    );

    expect(
      screen.queryByRole("button", { name: /使用建議值/ })
    ).not.toBeInTheDocument();
  });

  it("使用者已存過的目標值不受本月支出變動影響", () => {
    render(
      <TargetNetWorthInput
        value={5000000}
        monthlyExpense={99999}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText("目標淨資產")).toHaveValue("5000000");
  });

  it("點擊公式說明 icon 會顯示建議值的計算過程", () => {
    render(
      <TargetNetWorthInput
        value={0}
        monthlyExpense={20000}
        onChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText("目標淨資產建議值計算公式說明"));

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent(
      "建議值 = 本月支出 × 12 × 25（4% 提領法則）"
    );
    expect(content).toHaveTextContent("$20,000 × 12 × 25 = $6,000,000");
  });
});
