import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormulaInfoButton } from "@/components/FormulaInfoButton";

describe("FormulaInfoButton", () => {
  it("預設不顯示公式內容，點擊 icon 後才顯示標題、公式與代入實際數值的計算過程", () => {
    render(
      <FormulaInfoButton
        title="負債比"
        formula="負債比 = 總負債 ÷ 總資產 × 100%"
        substitution="$300,000 ÷ $1,000,000 × 100% = 30.0%"
        note="總資產為 0 時強制為 0%，避免除以零"
      />
    );

    expect(
      screen.queryByTestId("formula-info-content")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("負債比計算公式說明"));

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent("負債比");
    expect(content).toHaveTextContent("負債比 = 總負債 ÷ 總資產 × 100%");
    expect(content).toHaveTextContent("$300,000 ÷ $1,000,000 × 100% = 30.0%");
    expect(content).toHaveTextContent("總資產為 0 時強制為 0%，避免除以零");
  });

  it("未提供 note 時不顯示邊界情況說明", () => {
    render(
      <FormulaInfoButton
        title="現金比例"
        formula="現金比例 = 總流動現金 ÷ 總資產 × 100%"
        substitution="$350,000 ÷ $1,000,000 × 100% = 35.0%"
      />
    );

    fireEvent.click(screen.getByLabelText("現金比例計算公式說明"));

    const content = screen.getByTestId("formula-info-content");
    expect(content.textContent).not.toContain("邊界");
  });
});
