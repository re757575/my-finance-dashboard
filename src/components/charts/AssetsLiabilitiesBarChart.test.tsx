import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssetsLiabilitiesBarChart } from "@/components/charts/AssetsLiabilitiesBarChart";

const points = [
  { date: "2026-07-11", assets: 150000, liabilities: 20000 },
  { date: "2026-07-12", assets: 160000, liabilities: 18000 },
  { date: "2026-07-13", assets: 178000, liabilities: 18000 },
];

describe("AssetsLiabilitiesBarChart", () => {
  it("快照筆數 < 2 時顯示空狀態提示，不畫圖", () => {
    render(<AssetsLiabilitiesBarChart points={points.slice(0, 1)} />);

    expect(screen.getByText("持續使用滿 2 天即可查看趨勢")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  // PRD 4.2 節：長條圖節點 tooltip 同時顯示資產與負債兩個數值
  it("點擊節點顯示該節點的日期、資產與負債數值", () => {
    render(<AssetsLiabilitiesBarChart points={points} />);
    expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId("chart-node-1")[0]);

    expect(screen.getByTestId("chart-tooltip").textContent).toBe(
      "2026-07-12 資產 $160,000 ／ 負債 $18,000"
    );
  });

  it("點擊全螢幕展開按鈕會開啟 Dialog 並顯示每個節點的日期標籤", () => {
    render(<AssetsLiabilitiesBarChart points={points} />);

    fireEvent.click(screen.getByLabelText("資產負債對比全螢幕檢視"));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("07/11")).toBeInTheDocument();
    expect(within(dialog).getByText("07/12")).toBeInTheDocument();
    expect(within(dialog).getByText("07/13")).toBeInTheDocument();
  });
});
