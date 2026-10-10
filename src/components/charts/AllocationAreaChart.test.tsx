import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AllocationAreaChart,
  type AllocationPoint,
} from "@/components/charts/AllocationAreaChart";

function point(
  date: string,
  cash: number,
  restricted: number,
  tw: number,
  us: number
): AllocationPoint {
  return {
    date,
    cashRatio: cash,
    restrictedCashRatio: restricted,
    twStockRatio: tw,
    usStockRatio: us,
  };
}

// 第 3 筆有不可動用現金；前兩筆沒有
const points = [
  point("2026-07-11", 40, 0, 40, 20),
  point("2026-07-12", 30, 0, 45, 25),
  point("2026-07-13", 20, 10, 40, 30),
];

const noRestricted = points.map((p) => ({
  ...p,
  cashRatio: p.cashRatio + p.restrictedCashRatio,
  restrictedCashRatio: 0,
}));

describe("AllocationAreaChart", () => {
  // PRD 第 9 節 #50k
  it("快照筆數 < 2 時顯示空狀態提示，不畫圖", () => {
    render(<AllocationAreaChart points={points.slice(0, 1)} />);

    expect(screen.getByText("資產配置趨勢")).toBeInTheDocument();
    expect(screen.getByText("持續使用滿 2 天即可查看趨勢")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("沒有任何節點時同樣顯示空狀態，不拋錯", () => {
    render(<AllocationAreaChart points={[]} />);
    expect(screen.getByText("持續使用滿 2 天即可查看趨勢")).toBeInTheDocument();
  });

  it("可自訂標題", () => {
    render(<AllocationAreaChart title="配置變化" points={points} />);
    expect(screen.getByText("配置變化")).toBeInTheDocument();
    expect(screen.getByLabelText("配置變化全螢幕檢視")).toBeInTheDocument();
  });

  // PRD 第 9 節 #50d、#50f
  describe("堆疊的圖層", () => {
    it("任一節點有不可動用現金時，畫出四層（現金、不可動用現金、台股、美股）", () => {
      render(<AllocationAreaChart points={points} />);

      for (const key of ["cash", "restrictedCash", "twStock", "usStock"]) {
        expect(
          screen.getByTestId(`allocation-layer-${key}`)
        ).toBeInTheDocument();
      }
    });

    it("整段期間都沒有不可動用現金時，不畫該層，圖例也沒有該項", () => {
      render(<AllocationAreaChart points={noRestricted} />);

      expect(
        screen.queryByTestId("allocation-layer-restrictedCash")
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("allocation-layer-cash")).toBeInTheDocument();
      expect(
        within(screen.getByTestId("allocation-legend")).queryByText(
          /不可動用現金/
        )
      ).not.toBeInTheDocument();
    });

    it("四層由下而上堆疊成 100%：最上層的上緣在圖表頂端，最下層的下緣在圖表底端", () => {
      render(<AllocationAreaChart points={points} />);

      // compact：寬 320、高 120、padding 24 → 100% 在 y=24，0% 在 y=96；第一個節點 x=24
      expect(screen.getByTestId("allocation-layer-usStock")).toHaveAttribute(
        "d",
        expect.stringMatching(/^M 24\.0 24\.0 /)
      );
      const cashPath = screen
        .getByTestId("allocation-layer-cash")
        .getAttribute("d")!;
      // 最下層（現金）的下緣全落在 y=96.0（0%）
      const [, lowerEdge] = cashPath.split(" L ").reduce<[string[], string[]]>(
        (acc, seg, i, all) => {
          acc[i < all.length / 2 ? 0 : 1].push(seg);
          return acc;
        },
        [[], []]
      );
      expect(lowerEdge.every((seg) => /96\.0/.test(seg))).toBe(true);
    });

    it("圖層使用與資產配置長條圖一致的配色", () => {
      render(<AllocationAreaChart points={points} />);

      expect(screen.getByTestId("allocation-layer-cash")).toHaveClass(
        "fill-blue-600"
      );
      expect(screen.getByTestId("allocation-layer-restrictedCash")).toHaveClass(
        "fill-slate-500"
      );
      expect(screen.getByTestId("allocation-layer-twStock")).toHaveClass(
        "fill-orange-600"
      );
      expect(screen.getByTestId("allocation-layer-usStock")).toHaveClass(
        "fill-teal-600"
      );
    });
  });

  // PRD 第 9 節 #50d、第 7 節無障礙：色塊＋文字
  it("圖例以文字顯示最新一筆各類占比", () => {
    render(<AllocationAreaChart points={points} />);

    const legend = screen.getByTestId("allocation-legend");
    expect(legend).toHaveTextContent("現金 20.0%");
    expect(legend).toHaveTextContent("不可動用現金 10.0%");
    expect(legend).toHaveTextContent("台股 40.0%");
    expect(legend).toHaveTextContent("美股 30.0%");
  });

  it("圖表具有無障礙標籤，標明筆數", () => {
    render(<AllocationAreaChart points={points} />);
    expect(
      screen.getByRole("img", { name: "資產配置趨勢堆疊面積圖，共 3 筆資料" })
    ).toBeInTheDocument();
  });

  // PRD 第 9 節 #50e
  describe("節點 Tooltip", () => {
    it("點擊節點顯示該日期與各類占比", () => {
      render(<AllocationAreaChart points={points} />);
      expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();

      fireEvent.click(screen.getAllByTestId("chart-node-1")[0]);

      const tooltip = screen.getByTestId("chart-tooltip");
      expect(tooltip).toHaveTextContent("2026-07-12");
      expect(tooltip).toHaveTextContent("現金 30.0%");
      expect(tooltip).toHaveTextContent("台股 45.0%");
      expect(tooltip).toHaveTextContent("美股 25.0%");
    });

    it("不可動用現金為 0 的節點不列該行；大於 0 的節點才列", () => {
      render(<AllocationAreaChart points={points} />);

      fireEvent.click(screen.getAllByTestId("chart-node-0")[0]);
      expect(screen.getByTestId("chart-tooltip")).not.toHaveTextContent(
        "不可動用現金"
      );

      fireEvent.click(screen.getAllByTestId("chart-node-2")[0]);
      expect(screen.getByTestId("chart-tooltip")).toHaveTextContent(
        "不可動用現金 10.0%"
      );
    });

    it("hover 顯示、移開後消失", () => {
      render(<AllocationAreaChart points={points} />);
      const node = screen.getAllByTestId("chart-node-0")[0];

      fireEvent.mouseEnter(node);
      expect(screen.getByTestId("chart-tooltip")).toBeInTheDocument();

      fireEvent.mouseLeave(node);
      expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();
    });

    it("點擊圖表其他位置會關閉 Tooltip", () => {
      render(<AllocationAreaChart points={points} />);
      fireEvent.click(screen.getAllByTestId("chart-node-1")[0]);
      expect(screen.getByTestId("chart-tooltip")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("img"));

      expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();
    });
  });

  // PRD 第 9 節 #50i
  describe("全螢幕展開", () => {
    it("compact 卡片不顯示 Y 軸刻度", () => {
      render(<AllocationAreaChart points={points} />);

      for (const tick of ["0%", "25%", "50%", "75%", "100%"]) {
        expect(screen.queryByText(tick)).not.toBeInTheDocument();
      }
    });

    it("開啟 Dialog 後顯示每個節點的 MM/DD 日期標籤與固定的 0／25／50／75／100% 刻度", () => {
      render(<AllocationAreaChart points={points} />);

      fireEvent.click(screen.getByLabelText("資產配置趨勢全螢幕檢視"));

      const dialog = screen.getByRole("dialog");
      for (const label of ["07/11", "07/12", "07/13"]) {
        expect(within(dialog).getByText(label)).toBeInTheDocument();
      }
      for (const tick of ["0%", "25%", "50%", "75%", "100%"]) {
        expect(within(dialog).getByText(tick)).toBeInTheDocument();
      }
    });

    // PRD 第 7 節：圖表內文字一律 12px
    it("Y 軸刻度與日期標籤皆為 12px 字級", () => {
      render(<AllocationAreaChart points={points} />);

      fireEvent.click(screen.getByLabelText("資產配置趨勢全螢幕檢視"));

      const texts = screen.getByRole("dialog").querySelectorAll("svg text");
      // 5 個 Y 軸刻度＋每個節點一個日期
      expect(texts).toHaveLength(5 + points.length);
      for (const text of texts) expect(text).toHaveClass("text-xs");
    });

    it("刻度數量固定，不因節點數增加而變多", () => {
      const many = Array.from({ length: 30 }, (_, i) =>
        point(`2026-08-${String(i + 1).padStart(2, "0")}`, 50, 0, 30, 20)
      );
      render(<AllocationAreaChart points={many} />);

      fireEvent.click(screen.getByLabelText("資產配置趨勢全螢幕檢視"));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getAllByText(/^\d{1,3}%$/)).toHaveLength(5);
    });

    it("全螢幕內也有圖例，且圖表無障礙標籤標明全螢幕", () => {
      render(<AllocationAreaChart points={points} />);

      fireEvent.click(screen.getByLabelText("資產配置趨勢全螢幕檢視"));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByTestId("allocation-legend")).toHaveTextContent(
        "美股 30.0%"
      );
      expect(
        within(dialog).getByRole("img", {
          name: "資產配置趨勢堆疊面積圖，共 3 筆資料（全螢幕）",
        })
      ).toBeInTheDocument();
    });

    it("全螢幕內的節點同樣支援 Tooltip", () => {
      render(<AllocationAreaChart points={points} />);
      fireEvent.click(screen.getByLabelText("資產配置趨勢全螢幕檢視"));
      const dialog = screen.getByRole("dialog");

      fireEvent.click(within(dialog).getByTestId("chart-node-2"));

      expect(within(dialog).getByTestId("chart-tooltip")).toHaveTextContent(
        "2026-07-13"
      );
    });
  });

  // PRD 4.2「快照備註」第 5 點、第 9 節 #72f
  describe("快照備註", () => {
    const noted = [
      points[0],
      { ...points[1], note: "換工作" },
      { ...points[2], note: "" },
    ];

    it("有備註的節點上方畫出帶圓心的圓環標記，其他節點沒有", () => {
      const { container } = render(<AllocationAreaChart points={noted} />);

      const markers = container.querySelectorAll(
        '[data-testid^="chart-note-marker-"]'
      );
      expect(markers).toHaveLength(1);
      expect(markers[0]).toHaveAttribute("data-testid", "chart-note-marker-1");
      expect(markers[0].querySelectorAll("circle")).toHaveLength(2);
    });

    it("沒有任何備註時不畫標記", () => {
      const { container } = render(<AllocationAreaChart points={points} />);

      expect(
        container.querySelector('[data-testid^="chart-note-marker-"]')
      ).toBeNull();
    });

    it("有備註的節點 Tooltip 最後多一行備註，其他節點沒有", () => {
      render(<AllocationAreaChart points={noted} />);

      fireEvent.click(screen.getAllByTestId("chart-node-1")[0]);
      const tooltip = screen.getByTestId("chart-tooltip");
      expect(tooltip.lastElementChild?.textContent).toBe("備註：換工作");
      expect(tooltip.textContent).toContain("2026-07-12");

      fireEvent.click(screen.getAllByTestId("chart-node-0")[0]);
      expect(
        screen.queryByTestId("chart-tooltip-note")
      ).not.toBeInTheDocument();
    });

    it("全螢幕檢視同樣有標記與備註行", () => {
      render(<AllocationAreaChart points={noted} />);
      fireEvent.click(screen.getByLabelText("資產配置趨勢全螢幕檢視"));

      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).getByTestId("chart-note-marker-1")
      ).toBeInTheDocument();
      fireEvent.click(within(dialog).getByTestId("chart-node-1"));
      expect(within(dialog).getByTestId("chart-tooltip-note").textContent).toBe(
        "備註：換工作"
      );
    });
  });
});
