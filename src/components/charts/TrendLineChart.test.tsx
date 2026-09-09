import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrendLineChart } from "@/components/charts/TrendLineChart";
import { formatCurrency } from "@/lib/format";

const points = [
  { date: "2026-07-11", value: 100000 },
  { date: "2026-07-12", value: 120000 },
  { date: "2026-07-13", value: 150000 },
];

describe("TrendLineChart", () => {
  it("快照筆數 < 2 時顯示空狀態提示，不畫圖", () => {
    render(<TrendLineChart title="淨資產趨勢" points={points.slice(0, 1)} />);

    expect(screen.getByText("持續使用滿 2 天即可查看趨勢")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  // PRD 4.2 節：節點 hover/點擊顯示 Tooltip
  it("點擊節點顯示該節點的日期與數值 tooltip", () => {
    render(
      <TrendLineChart
        title="淨資產趨勢"
        points={points}
        formatValue={formatCurrency}
      />
    );
    expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId("chart-node-1")[0]);

    expect(screen.getByTestId("chart-tooltip").textContent).toBe(
      "2026-07-12 $120,000"
    );
  });

  it("點擊圖表空白處會關閉 tooltip", () => {
    render(<TrendLineChart title="淨資產趨勢" points={points} />);

    fireEvent.click(screen.getAllByTestId("chart-node-1")[0]);
    expect(screen.getByTestId("chart-tooltip")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("img")[0]);
    expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();
  });

  // PRD 4.2 節：全螢幕檢視固定節點間距，每個節點下方顯示日期
  it("點擊全螢幕展開按鈕會開啟 Dialog 並顯示每個節點的日期標籤", () => {
    render(<TrendLineChart title="淨資產趨勢" points={points} />);

    fireEvent.click(screen.getByLabelText("淨資產趨勢全螢幕檢視"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("07/11")).toBeInTheDocument();
    expect(screen.getByText("07/12")).toBeInTheDocument();
    expect(screen.getByText("07/13")).toBeInTheDocument();
  });

  it("全螢幕檢視內的節點也支援獨立的 tooltip", () => {
    render(
      <TrendLineChart
        title="淨資產趨勢"
        points={points}
        formatValue={formatCurrency}
      />
    );
    fireEvent.click(screen.getByLabelText("淨資產趨勢全螢幕檢視"));

    const dialog = screen.getByRole("dialog");
    const fullscreenNode = within(dialog).getAllByTestId("chart-node-1")[0];
    fireEvent.click(fullscreenNode);

    expect(within(dialog).getByTestId("chart-tooltip").textContent).toBe(
      "2026-07-12 $120,000"
    );
  });

  // PRD 4.2 節：淨資產趨勢圖增減比對
  describe("showDelta", () => {
    it("預設不顯示增減比對，維持原本的日期範圍列", () => {
      render(
        <TrendLineChart
          title="淨資產趨勢"
          points={points}
          formatValue={formatCurrency}
        />
      );

      expect(screen.getByText("2026-07-11")).toBeInTheDocument();
      expect(screen.queryByText(/▲|▼|持平/)).not.toBeInTheDocument();
    });

    it("數值上升時在日期範圍列上方顯示紅色增加金額與百分比", () => {
      render(
        <TrendLineChart
          title="淨資產趨勢"
          points={points}
          formatValue={formatCurrency}
          showDelta
        />
      );

      const delta = screen.getByText("▲ $30,000 (+25.0%)");
      expect(delta).toHaveClass("text-rose-600");
      // 日期範圍列（首/末日期）維持顯示
      expect(screen.getByText("2026-07-11")).toBeInTheDocument();
      expect(screen.getByText("2026-07-13")).toBeInTheDocument();
    });

    it("數值下降時顯示綠色減少金額與百分比", () => {
      render(
        <TrendLineChart
          title="淨資產趨勢"
          points={[
            { date: "2026-07-11", value: 100000 },
            { date: "2026-07-12", value: 80000 },
          ]}
          formatValue={formatCurrency}
          showDelta
        />
      );

      const delta = screen.getByText("▼ $20,000 (-20.0%)");
      expect(delta).toHaveClass("text-emerald-600");
    });

    it("與上一筆數值相同時顯示中性文字「持平」", () => {
      render(
        <TrendLineChart
          title="淨資產趨勢"
          points={[
            { date: "2026-07-11", value: 100000 },
            { date: "2026-07-12", value: 100000 },
          ]}
          formatValue={formatCurrency}
          showDelta
        />
      );

      expect(screen.getByText("持平")).toBeInTheDocument();
    });

    it("上一筆數值為 0 以下時只顯示金額，不顯示百分比", () => {
      render(
        <TrendLineChart
          title="淨資產趨勢"
          points={[
            { date: "2026-07-11", value: -50000 },
            { date: "2026-07-12", value: 20000 },
          ]}
          formatValue={formatCurrency}
          showDelta
        />
      );

      expect(screen.getByText("▲ $70,000")).toBeInTheDocument();
    });

    it("全螢幕展開檢視也同步顯示增減比對", () => {
      render(
        <TrendLineChart
          title="淨資產趨勢"
          points={points}
          formatValue={formatCurrency}
          showDelta
        />
      );

      fireEvent.click(screen.getByLabelText("淨資產趨勢全螢幕檢視"));

      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).getByText("▲ $30,000 (+25.0%)")
      ).toBeInTheDocument();
    });

    it("點擊非最後一筆的節點時，tooltip 額外顯示與最新一筆比對的增減", () => {
      render(
        <TrendLineChart
          title="淨資產趨勢"
          points={points}
          formatValue={formatCurrency}
          showDelta
        />
      );

      fireEvent.click(screen.getAllByTestId("chart-node-1")[0]);

      const tooltip = screen.getByTestId("chart-tooltip");
      expect(tooltip.textContent).toBe(
        "2026-07-12 $120,000距今 ▲ $30,000 (+25.0%)"
      );
    });

    it("點擊最後一筆節點時，tooltip 不顯示與最新一筆比對的增減（同一天）", () => {
      render(
        <TrendLineChart
          title="淨資產趨勢"
          points={points}
          formatValue={formatCurrency}
          showDelta
        />
      );

      fireEvent.click(screen.getAllByTestId("chart-node-2")[0]);

      expect(screen.getByTestId("chart-tooltip").textContent).toBe(
        "2026-07-13 $150,000"
      );
      expect(screen.queryByText(/距今/)).not.toBeInTheDocument();
    });

    it("未開啟 showDelta 時，節點 tooltip 不顯示與最新一筆比對的增減", () => {
      render(
        <TrendLineChart
          title="淨資產趨勢"
          points={points}
          formatValue={formatCurrency}
        />
      );

      fireEvent.click(screen.getAllByTestId("chart-node-1")[0]);

      expect(screen.getByTestId("chart-tooltip").textContent).toBe(
        "2026-07-12 $120,000"
      );
    });
  });
});
