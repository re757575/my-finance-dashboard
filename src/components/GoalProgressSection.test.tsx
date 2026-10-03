import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoalProgressSection } from "@/components/GoalProgressSection";
import type { GoalEstimates } from "@/lib/calculations";

const ESTIMATES: GoalEstimates = {
  baseDate: "2026-10-03",
  budget: {
    status: "ok",
    monthlyPace: 60000,
    months: 100,
    cashFlow: 60000,
    principalRepayment: 0,
  },
  history: {
    status: "no-data",
    monthlyPace: null,
    months: null,
    fromDate: null,
    toDate: null,
  },
};

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

  // PRD 4.2「目標達成時間預估」
  describe("預估達成時間", () => {
    it("有傳入估算且尚未達成時，於進度條下方顯示", () => {
      render(
        <GoalProgressSection
          netWorth={4000000}
          targetNetWorth={10000000}
          monthlyExpense={40000}
          progress={40}
          estimates={ESTIMATES}
          onSetTarget={vi.fn()}
        />
      );

      expect(screen.getByTestId("goal-eta-budget")).toHaveTextContent(
        "約 8 年 4 個月（預計 2035 年 2 月）"
      );
      expect(screen.getByTestId("goal-eta-history")).toHaveTextContent(
        "需要相隔至少 30 天的兩筆已存檔快照"
      );
    });

    it("未傳入估算時不顯示", () => {
      render(
        <GoalProgressSection
          netWorth={4000000}
          targetNetWorth={10000000}
          monthlyExpense={40000}
          progress={40}
          onSetTarget={vi.fn()}
        />
      );

      expect(screen.queryByTestId("goal-eta")).not.toBeInTheDocument();
    });

    // 第 9 節 #56k
    it("尚未設定目標時只顯示引導文字，不顯示預估達成時間", () => {
      render(
        <GoalProgressSection
          netWorth={4000000}
          targetNetWorth={0}
          monthlyExpense={40000}
          progress={null}
          estimates={{
            ...ESTIMATES,
            budget: { ...ESTIMATES.budget, status: "unset", months: null },
            history: { ...ESTIMATES.history, status: "unset" },
          }}
          onSetTarget={vi.fn()}
        />
      );

      expect(screen.getByTestId("goal-progress-empty")).toBeInTheDocument();
      expect(screen.queryByTestId("goal-eta")).not.toBeInTheDocument();
    });

    // 第 9 節 #56k
    it("已達成目標時不顯示預估達成時間", () => {
      render(
        <GoalProgressSection
          netWorth={12000000}
          targetNetWorth={10000000}
          monthlyExpense={40000}
          progress={120}
          estimates={{
            ...ESTIMATES,
            budget: { ...ESTIMATES.budget, status: "achieved", months: null },
            history: { ...ESTIMATES.history, status: "achieved" },
          }}
          onSetTarget={vi.fn()}
        />
      );

      expect(screen.getByTestId("goal-progress-achieved")).toBeInTheDocument();
      expect(screen.queryByTestId("goal-eta")).not.toBeInTheDocument();
    });
  });
});
