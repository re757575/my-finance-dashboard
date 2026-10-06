import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NetWorthPerformance } from "@/components/NetWorthPerformance";
import { createEmptySnapshot, type Snapshot } from "@/types/schema";

/** 建立指定淨資產的快照：正數放在現金，負數以一筆負債表示。 */
function snap(date: string, netWorth: number): Snapshot {
  return {
    ...createEmptySnapshot(date),
    cashSources:
      netWorth > 0
        ? [{ id: "c1", name: "現金", amount: netWorth, restricted: false }]
        : [],
    debts:
      netWorth < 0
        ? [
            {
              id: "d1",
              name: "信貸",
              category: "信貸",
              principal: -netWorth,
              annualRate: 0,
              remainingMonths: 12,
              repaymentMethod: "amortizing",
              collateralValue: 0,
            },
          ]
        : [],
  };
}

const card = () => screen.getByTestId("net-worth-performance");
const growthLabel = () => screen.getByTestId("net-worth-growth-label");
const growthValue = () => screen.getByTestId("net-worth-growth-value");
const growthNote = () => screen.getByTestId("net-worth-growth-note");
const changeValue = () => screen.getByTestId("net-worth-change-value");
const drawdownValue = () => screen.getByTestId("net-worth-drawdown-value");

// 2020-01-01 → 2024-01-01 = 1461 天（365.25 × 4）；1,000,000 → 1,464,100（1.1^4）→ 年化 10%
// 中途 1,200,000 → 900,000：回撤 25%（$300,000），期末已高於 1,200,000 → 已回復
const FOUR_YEARS = [
  snap("2020-01-01", 1_000_000),
  snap("2021-01-01", 1_200_000),
  snap("2022-01-01", 900_000),
  snap("2024-01-01", 1_464_100),
];

describe("NetWorthPerformance", () => {
  it("沒有快照或只有 1 筆時不顯示", () => {
    const { container, rerender } = render(
      <NetWorthPerformance snapshots={[]} />
    );
    expect(container).toBeEmptyDOMElement();

    rerender(<NetWorthPerformance snapshots={[snap("2026-01-01", 100)]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("滿 1 年：顯示統計期間、淨資產變化、年化成長率與最大回撤", () => {
    render(<NetWorthPerformance snapshots={FOUR_YEARS} />);

    expect(
      screen.getByTestId("net-worth-performance-period")
    ).toHaveTextContent("統計期間 2020-01-01 ～ 2024-01-01（1,461 天）");
    expect(changeValue()).toHaveTextContent("▲ $464,100");
    expect(growthLabel()).toHaveTextContent("年化成長率");
    expect(growthValue()).toHaveTextContent("▲ 10.0%");
    expect(growthNote()).toHaveTextContent("期間累計 +46.4%");
    expect(drawdownValue()).toHaveTextContent("▼ 25.0%");
    expect(screen.getByTestId("net-worth-drawdown-detail")).toHaveTextContent(
      "下跌 $300,000"
    );
    expect(screen.getByTestId("net-worth-drawdown-detail")).toHaveTextContent(
      "2021-01-01 → 2022-01-01"
    );
    expect(screen.getByTestId("net-worth-drawdown-recovery")).toHaveTextContent(
      "已回復"
    );
  });

  it("註明淨資產變化不等於投資報酬率", () => {
    render(<NetWorthPerformance snapshots={FOUR_YEARS} />);

    expect(card()).toHaveTextContent(
      "淨資產變化包含儲蓄投入與負債償還，不等於投資報酬率"
    );
  });

  it("輸入未依日期排序時結果相同", () => {
    render(
      <NetWorthPerformance
        snapshots={[FOUR_YEARS[2], FOUR_YEARS[3], FOUR_YEARS[0], FOUR_YEARS[1]]}
      />
    );

    expect(
      screen.getByTestId("net-worth-performance-period")
    ).toHaveTextContent("2020-01-01 ～ 2024-01-01");
    expect(growthValue()).toHaveTextContent("▲ 10.0%");
    expect(drawdownValue()).toHaveTextContent("▼ 25.0%");
  });

  // 2026-01-01 → 2026-12-31 = 364 天
  it("未滿 1 年：改顯示期間成長率並註明「未滿 1 年不年化」", () => {
    render(
      <NetWorthPerformance
        snapshots={[snap("2026-01-01", 100_000), snap("2026-12-31", 110_000)]}
      />
    );

    expect(growthLabel()).toHaveTextContent("期間成長率");
    expect(growthValue()).toHaveTextContent("▲ 10.0%");
    expect(growthNote()).toHaveTextContent("未滿 1 年不年化");
    expect(card()).not.toHaveTextContent("年化成長率");
  });

  it("期初淨資產 ≤ 0：成長率顯示「—」並說明原因，不出現 NaN／Infinity", () => {
    render(
      <NetWorthPerformance
        snapshots={[snap("2020-01-01", 0), snap("2024-01-01", 500_000)]}
      />
    );

    expect(changeValue()).toHaveTextContent("▲ $500,000");
    expect(growthValue()).toHaveTextContent("—");
    expect(growthNote()).toHaveTextContent("期初淨資產不為正，無法計算成長率");
    expect(card().textContent).not.toMatch(/NaN|Infinity/);
  });

  it("滿 1 年但期末淨資產為負：改顯示期間成長率並說明無法年化", () => {
    render(
      <NetWorthPerformance
        snapshots={[snap("2020-01-01", 100_000), snap("2024-01-01", -50_000)]}
      />
    );

    expect(changeValue()).toHaveTextContent("▼ $150,000");
    expect(growthLabel()).toHaveTextContent("期間成長率");
    expect(growthValue()).toHaveTextContent("▼ 150.0%");
    expect(growthNote()).toHaveTextContent("期末淨資產為負，無法年化");
    expect(card().textContent).not.toMatch(/NaN|Infinity/);
  });

  it("增減沿用 DeltaText：增加為 ▲ rose、減少為 ▼ emerald", () => {
    const { rerender } = render(<NetWorthPerformance snapshots={FOUR_YEARS} />);

    expect(changeValue().querySelector("span")).toHaveClass("text-rose-600");
    expect(growthValue().querySelector("span")).toHaveClass("text-rose-600");
    // 回撤一律是下跌
    expect(drawdownValue().querySelector("span")).toHaveClass(
      "text-emerald-600"
    );

    // 2018-01-01 → 2026-01-01 = 2922 天（8 年）；淨資產腰斬：0.5^(1/8) − 1 = −8.3%
    rerender(
      <NetWorthPerformance
        snapshots={[snap("2018-01-01", 200_000), snap("2026-01-01", 100_000)]}
      />
    );

    expect(changeValue()).toHaveTextContent("▼ $100,000");
    expect(changeValue().querySelector("span")).toHaveClass("text-emerald-600");
    expect(growthValue()).toHaveTextContent("▼ 8.3%");
    expect(growthValue().querySelector("span")).toHaveClass("text-emerald-600");
    expect(growthNote()).toHaveTextContent("期間累計 -50.0%");
  });

  it("期初與期末淨資產相同時，變化與成長率顯示「持平」", () => {
    render(
      <NetWorthPerformance
        snapshots={[
          snap("2020-01-01", 100_000),
          snap("2022-01-01", 80_000),
          snap("2024-01-01", 100_000),
        ]}
      />
    );

    expect(changeValue()).toHaveTextContent("持平");
    expect(growthValue()).toHaveTextContent("持平");
    // 中途仍有回撤：100,000 → 80,000 = 20%，期末回到高點
    expect(drawdownValue()).toHaveTextContent("▼ 20.0%");
    expect(screen.getByTestId("net-worth-drawdown-recovery")).toHaveTextContent(
      "已回復"
    );
  });

  it("回撤後未回到高點時標示「尚未回復」", () => {
    render(
      <NetWorthPerformance
        snapshots={[
          snap("2020-01-01", 100_000),
          snap("2021-01-01", 120_000),
          snap("2022-01-01", 60_000),
        ]}
      />
    );

    expect(drawdownValue()).toHaveTextContent("▼ 50.0%");
    expect(screen.getByTestId("net-worth-drawdown-detail")).toHaveTextContent(
      "下跌 $60,000"
    );
    expect(screen.getByTestId("net-worth-drawdown-detail")).toHaveTextContent(
      "2021-01-01 → 2022-01-01"
    );
    expect(screen.getByTestId("net-worth-drawdown-recovery")).toHaveTextContent(
      "尚未回復"
    );
  });

  it("期間內從未下跌時顯示「期間內沒有回撤」", () => {
    render(
      <NetWorthPerformance
        snapshots={[
          snap("2020-01-01", 100_000),
          snap("2021-01-01", 110_000),
          snap("2022-01-01", 130_000),
        ]}
      />
    );

    expect(drawdownValue()).toHaveTextContent("期間內沒有回撤");
    expect(
      screen.queryByTestId("net-worth-drawdown-recovery")
    ).not.toBeInTheDocument();
  });

  it("高點不為正時不寫成「沒有回撤」，改說明無法計算跌幅", () => {
    render(
      <NetWorthPerformance
        snapshots={[snap("2020-01-01", -100_000), snap("2022-01-01", -200_000)]}
      />
    );

    expect(changeValue()).toHaveTextContent("▼ $100,000");
    expect(drawdownValue()).toHaveTextContent("高點不為正，無法計算跌幅");
    expect(card()).not.toHaveTextContent("期間內沒有回撤");
    expect(card().textContent).not.toMatch(/NaN|Infinity/);
  });

  it("公式說明：點擊後顯示三個公式與代入實際數值的計算過程", () => {
    render(<NetWorthPerformance snapshots={FOUR_YEARS} />);

    expect(
      screen.queryByTestId("formula-info-content")
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByLabelText("淨資產成長率與最大回撤計算公式說明")
    );

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent(
      "年化成長率 =（期末 ÷ 期初）^(365.25 ÷ 天數) − 1"
    );
    expect(content).toHaveTextContent(
      "期間成長率 =（期末 − 期初）÷ 期初 × 100%"
    );
    expect(content).toHaveTextContent(
      "最大回撤 =（高點 − 其後最低點）÷ 高點 × 100%"
    );
    expect(content).toHaveTextContent(
      "($1,464,100 ÷ $1,000,000)^(365.25 ÷ 1461) − 1 = 10.0%"
    );
    expect(content).toHaveTextContent(
      "($1,464,100 − $1,000,000) ÷ $1,000,000 × 100% = 46.4%"
    );
    expect(content).toHaveTextContent(
      "($1,200,000 − $900,000) ÷ $1,200,000 × 100% = 25.0%"
    );
    expect(content).toHaveTextContent("未滿 365 天不年化");
  });

  it("公式說明：未滿 1 年且沒有回撤時，以文字說明而非代入數值", () => {
    render(
      <NetWorthPerformance
        snapshots={[snap("2026-01-01", 100_000), snap("2026-12-31", 110_000)]}
      />
    );

    fireEvent.click(
      screen.getByLabelText("淨資產成長率與最大回撤計算公式說明")
    );

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent("年化：期間 364 天，未滿 1 年不年化");
    expect(content).toHaveTextContent(
      "($110,000 − $100,000) ÷ $100,000 × 100% = 10.0%"
    );
    expect(content).toHaveTextContent("最大回撤：期間內沒有回撤");
  });
});
