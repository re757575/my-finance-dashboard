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
});
