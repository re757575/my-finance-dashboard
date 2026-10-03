import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoalEta } from "@/components/GoalEta";
import type { GoalEstimates } from "@/lib/calculations";

function estimates(
  budget: Partial<GoalEstimates["budget"]> = {},
  history: Partial<GoalEstimates["history"]> = {}
): GoalEstimates {
  return {
    baseDate: "2026-10-03",
    budget: {
      status: "ok",
      monthlyPace: 60000,
      months: 100,
      cashFlow: 50000,
      principalRepayment: 10000,
      ...budget,
    },
    history: {
      status: "ok",
      monthlyPace: 50034.25,
      months: 48,
      fromDate: "2025-10-01",
      toDate: "2026-10-01",
      ...history,
    },
  };
}

function renderEta(value: GoalEstimates) {
  return render(
    <GoalEta estimates={value} netWorth={4000000} targetNetWorth={10000000} />
  );
}

// PRD 4.2「目標達成時間預估」、5.7a 節、第 9 節 #56a～#56k
describe("GoalEta", () => {
  // #56a、#56g
  it("可估算時顯示「約 X 年 Y 個月（預計 YYYY 年 M 月）」與每月增加額", () => {
    renderEta(estimates());

    expect(screen.getByTestId("goal-eta-budget")).toHaveTextContent(
      "依目前收支約 8 年 4 個月（預計 2035 年 2 月）每月約增加 $60,000（現金流＋償還本金）"
    );
    expect(screen.getByTestId("goal-eta-history")).toHaveTextContent(
      "依歷史變化約 4 年（預計 2030 年 10 月）每月約增加 $50,034（2025-10-01 → 2026-10-01）"
    );
  });

  it("不足 1 年只顯示月數", () => {
    renderEta(estimates({ months: 5 }));

    expect(screen.getByTestId("goal-eta-budget")).toHaveTextContent(
      "約 5 個月（預計 2027 年 3 月）"
    );
  });

  it("預計達成月份自 baseDate 起算", () => {
    renderEta({ ...estimates(), baseDate: "2026-01-15" });

    expect(screen.getByTestId("goal-eta-budget")).toHaveTextContent(
      "約 8 年 4 個月（預計 2034 年 5 月）"
    );
  });

  // #56e
  it("每月增加額 ≤ 0 時說明無法估算，並顯示每月減少的金額", () => {
    renderEta(
      estimates({ status: "not-growing", monthlyPace: -5000, months: null })
    );

    const row = screen.getByTestId("goal-eta-budget");
    expect(row).toHaveTextContent("淨資產沒有增加，無法估算");
    expect(row).toHaveTextContent("每月約減少 $5,000");
    expect(row).not.toHaveTextContent("預計");
    // 另一種估算不受影響
    expect(screen.getByTestId("goal-eta-history")).toHaveTextContent("約 4 年");
  });

  // #56f
  it("超過 100 年時不顯示具體時間", () => {
    renderEta(
      estimates({ status: "too-far", monthlyPace: 1000, months: null })
    );

    const row = screen.getByTestId("goal-eta-budget");
    expect(row).toHaveTextContent("超過 100 年");
    expect(row).toHaveTextContent("每月約增加 $1,000");
    expect(row).not.toHaveTextContent("預計");
  });

  // #56i
  it("沒有可用的歷史快照時顯示提示文字，不顯示每月增加額", () => {
    renderEta(
      estimates(
        {},
        {
          status: "no-data",
          monthlyPace: null,
          months: null,
          fromDate: null,
          toDate: null,
        }
      )
    );

    const row = screen.getByTestId("goal-eta-history");
    expect(row).toHaveTextContent("需要相隔至少 30 天的兩筆已存檔快照");
    expect(row).not.toHaveTextContent("每月約");
    expect(screen.getByTestId("goal-eta-budget")).toHaveTextContent(
      "約 8 年 4 個月"
    );
  });

  // #56k
  it.each(["unset", "achieved"] as const)(
    "狀態為 %s 時不顯示預估達成時間",
    (status) => {
      renderEta(estimates({ status, months: null }, { status, months: null }));

      expect(screen.queryByTestId("goal-eta")).not.toBeInTheDocument();
    }
  );

  it("固定顯示線性估算的說明文字", () => {
    renderEta(estimates());

    expect(
      screen.getByText(
        "線性估算，未計入未來的投資報酬、通膨與收支變動，僅供參考"
      )
    ).toBeInTheDocument();
  });

  it("公式說明顯示每月增加額的組成與代入數值", () => {
    renderEta(estimates());

    fireEvent.click(screen.getByLabelText("預估達成時間計算公式說明"));

    expect(
      screen.getByText(/每月增加額 = 現金流 \+ 本月償還的負債本金/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\$50,000 \+ \$10,000 = \$60,000/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\(\$10,000,000 − \$4,000,000\) ÷ \$60,000 → 100 個月/)
    ).toBeInTheDocument();
  });

  it("無法估算時，公式說明只列出每月增加額，不列出月數", () => {
    renderEta(
      estimates({
        status: "not-growing",
        monthlyPace: -5000,
        months: null,
        cashFlow: -8000,
        principalRepayment: 3000,
      })
    );

    fireEvent.click(screen.getByLabelText("預估達成時間計算公式說明"));

    expect(
      screen.getByText(/-\$8,000 \+ \$3,000 = -\$5,000/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/→ .* 個月/)).not.toBeInTheDocument();
  });
});
