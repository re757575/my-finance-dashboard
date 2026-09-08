import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoalProgressSection } from "@/components/GoalProgressSection";

describe("GoalProgressSection", () => {
  // PRD 第 9 節 #31a：目標未設定時顯示引導文字＋「使用建議值」按鈕
  it("目標未設定（progress 為 null）時顯示引導文字與建議值按鈕", () => {
    const onSetTarget = vi.fn();
    render(
      <GoalProgressSection
        netWorth={350000}
        targetNetWorth={0}
        monthlyExpense={30000}
        progress={null}
        onSetTarget={onSetTarget}
      />
    );

    expect(screen.getByTestId("goal-progress-empty")).toHaveTextContent(
      "尚未設定目標淨資產"
    );
    fireEvent.click(
      screen.getByRole("button", { name: "使用建議值 $9,000,000" })
    );
    expect(onSetTarget).toHaveBeenCalledWith(9000000);
  });

  // PRD 第 9 節 #31：進度計算與進度條寬度
  it("依比例顯示進度百分比與進度條寬度", () => {
    render(
      <GoalProgressSection
        netWorth={3500000}
        targetNetWorth={10000000}
        monthlyExpense={30000}
        progress={35}
        onSetTarget={vi.fn()}
      />
    );

    expect(screen.getByTestId("goal-progress-value")).toHaveTextContent(
      "35.0%"
    );
    expect(screen.getByTestId("goal-progress-bar-fill")).toHaveStyle({
      width: "35%",
    });
    expect(
      screen.queryByTestId("goal-progress-achieved")
    ).not.toBeInTheDocument();
  });

  // PRD 第 9 節 #31c：超過目標時進度條封頂在 100%，但數字不封頂，並顯示已達成標記
  it("淨資產超過目標時，進度條寬度夾在 100%，百分比數字不封頂", () => {
    render(
      <GoalProgressSection
        netWorth={14200000}
        targetNetWorth={10000000}
        monthlyExpense={30000}
        progress={142}
        onSetTarget={vi.fn()}
      />
    );

    expect(screen.getByTestId("goal-progress-value")).toHaveTextContent(
      "142.0%"
    );
    expect(screen.getByTestId("goal-progress-bar-fill")).toHaveStyle({
      width: "100%",
    });
    expect(screen.getByTestId("goal-progress-achieved")).toBeInTheDocument();
  });

  // PRD 第 9 節 #31d：淨資產為負數時進度條夾在 0%，不出現負寬度
  it("淨資產為負數時，進度條寬度夾在 0%", () => {
    render(
      <GoalProgressSection
        netWorth={-500000}
        targetNetWorth={10000000}
        monthlyExpense={30000}
        progress={-5}
        onSetTarget={vi.fn()}
      />
    );

    expect(screen.getByTestId("goal-progress-bar-fill")).toHaveStyle({
      width: "0%",
    });
  });
});
