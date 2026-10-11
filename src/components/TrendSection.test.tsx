import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrendSection } from "@/components/TrendSection";
import { createEmptySnapshot, type Snapshot } from "@/types/schema";

function baseSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    ...createEmptySnapshot("2026-01-01"),
    updatedAt: "2026-01-01T09:00:00.000Z",
    ...overrides,
  };
}

function cardFor(title: string) {
  return screen.getByText(title).closest(".rounded-xl") as HTMLElement;
}

type TrendTabName = "資產" | "負債" | "配置與儲蓄";

const tab = (name: TrendTabName) => screen.getByRole("tab", { name });

/** 切換趨勢圖分頁（Radix 的分頁在 mousedown 而非 click 時切換）。 */
function selectTab(name: TrendTabName) {
  fireEvent.mouseDown(tab(name));
}

/** 目前分頁內的圖表卡片標題（依 DOM 順序）。 */
function visibleChartTitles() {
  const panel = screen.getByRole("tabpanel");
  return Array.from(panel.children).map(
    (card) => card.querySelector("p")?.textContent
  );
}

const ASSET_CHARTS = ["淨資產趨勢", "現金趨勢", "股票趨勢"];
const LIABILITY_CHARTS = ["負債比趨勢", "資產負債對比", "每月應還款趨勢"];
const ALLOCATION_CHARTS = ["資產配置趨勢", "儲蓄率趨勢"];

describe("TrendSection", () => {
  // PRD 第 9 節 #58g
  it("尚無快照時，三個分頁共八張卡片皆顯示空狀態提示，且不顯示範圍下拉選單", () => {
    render(
      <TrendSection
        visibleSnapshots={[]}
        snapshotCount={0}
        trendRange="all"
        onRangeChange={vi.fn()}
        targetNetWorth={0}
      />
    );

    expect(screen.queryByLabelText("趨勢圖範圍")).not.toBeInTheDocument();
    // 分頁列照常顯示
    expect(screen.getAllByRole("tab")).toHaveLength(3);

    expect(visibleChartTitles()).toEqual(ASSET_CHARTS);
    expect(screen.getAllByText("持續使用滿 2 天即可查看趨勢")).toHaveLength(3);

    selectTab("負債");
    expect(visibleChartTitles()).toEqual(LIABILITY_CHARTS);
    expect(screen.getAllByText("持續使用滿 2 天即可查看趨勢")).toHaveLength(3);

    selectTab("配置與儲蓄");
    expect(visibleChartTitles()).toEqual(ALLOCATION_CHARTS);
    expect(screen.getAllByText("持續使用滿 2 天即可查看趨勢")).toHaveLength(2);
  });

  // PRD 4.2「趨勢圖分組分頁」、第 9 節 #58a～#58f
  describe("分組分頁", () => {
    const snapshots: Snapshot[] = [
      baseSnapshot({ date: "2026-01-01" }),
      baseSnapshot({ date: "2026-01-02" }),
    ];

    function renderSection(onRangeChange = vi.fn()) {
      return render(
        <TrendSection
          visibleSnapshots={snapshots}
          snapshotCount={2}
          trendRange="all"
          onRangeChange={onRangeChange}
          targetNetWorth={0}
        />
      );
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("分頁列有 tablist／tab／tabpanel 語意，預設選取「資產」", () => {
      renderSection();

      const tablist = screen.getByRole("tablist", { name: "趨勢圖分組" });
      expect(
        within(tablist)
          .getAllByRole("tab")
          .map((t) => t.textContent)
      ).toEqual(["資產", "負債", "配置與儲蓄"]);
      expect(tab("資產")).toHaveAttribute("aria-selected", "true");
      expect(tab("負債")).toHaveAttribute("aria-selected", "false");
      expect(tab("配置與儲蓄")).toHaveAttribute("aria-selected", "false");
      expect(
        screen.getByRole("tabpanel", { name: "資產" })
      ).toBeInTheDocument();
    });

    it("預設只渲染「資產」分頁的三張圖，其他分頁的圖不在 DOM 中", () => {
      renderSection();

      expect(visibleChartTitles()).toEqual(ASSET_CHARTS);
      for (const title of [...LIABILITY_CHARTS, ...ALLOCATION_CHARTS]) {
        expect(screen.queryByText(title)).not.toBeInTheDocument();
      }
      expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    });

    it("切換到「負債」分頁後依序顯示負債比、資產負債對比、每月應還款", () => {
      renderSection();

      selectTab("負債");

      expect(tab("負債")).toHaveAttribute("aria-selected", "true");
      expect(tab("資產")).toHaveAttribute("aria-selected", "false");
      expect(
        screen.getByRole("tabpanel", { name: "負債" })
      ).toBeInTheDocument();
      expect(visibleChartTitles()).toEqual(LIABILITY_CHARTS);
      for (const title of [...ASSET_CHARTS, ...ALLOCATION_CHARTS]) {
        expect(screen.queryByText(title)).not.toBeInTheDocument();
      }
    });

    it("切換到「配置與儲蓄」分頁後依序顯示資產配置、儲蓄率", () => {
      renderSection();

      selectTab("配置與儲蓄");

      expect(tab("配置與儲蓄")).toHaveAttribute("aria-selected", "true");
      expect(visibleChartTitles()).toEqual(ALLOCATION_CHARTS);
      for (const title of [...ASSET_CHARTS, ...LIABILITY_CHARTS]) {
        expect(screen.queryByText(title)).not.toBeInTheDocument();
      }
    });

    it("可切回「資產」分頁", () => {
      renderSection();

      selectTab("負債");
      selectTab("資產");

      expect(tab("資產")).toHaveAttribute("aria-selected", "true");
      expect(visibleChartTitles()).toEqual(ASSET_CHARTS);
    });

    it("鍵盤左右方向鍵可切換分頁，焦點跟著移動", async () => {
      renderSection();

      tab("資產").focus();
      fireEvent.keyDown(tab("資產"), { key: "ArrowRight" });
      await waitFor(() =>
        expect(tab("負債")).toHaveAttribute("aria-selected", "true")
      );
      expect(tab("負債")).toHaveFocus();
      expect(visibleChartTitles()).toEqual(LIABILITY_CHARTS);

      fireEvent.keyDown(tab("負債"), { key: "ArrowRight" });
      await waitFor(() =>
        expect(tab("配置與儲蓄")).toHaveAttribute("aria-selected", "true")
      );
      expect(visibleChartTitles()).toEqual(ALLOCATION_CHARTS);

      fireEvent.keyDown(tab("配置與儲蓄"), { key: "ArrowLeft" });
      await waitFor(() =>
        expect(tab("負債")).toHaveAttribute("aria-selected", "true")
      );
      expect(tab("負債")).toHaveFocus();
      expect(tab("資產")).toHaveAttribute("aria-selected", "false");
      expect(tab("配置與儲蓄")).toHaveAttribute("aria-selected", "false");
    });

    it("範圍下拉選單在每個分頁都在，切換分頁不會改變範圍", () => {
      const onRangeChange = vi.fn();
      renderSection(onRangeChange);

      for (const name of ["資產", "負債", "配置與儲蓄"] as const) {
        selectTab(name);
        expect(screen.getByLabelText("趨勢圖範圍")).toHaveValue("all");
      }
      expect(onRangeChange).not.toHaveBeenCalled();
    });

    it("在非預設分頁切換範圍：回報新範圍，重新渲染後仍停留在該分頁", () => {
      const onRangeChange = vi.fn();
      const { rerender } = renderSection(onRangeChange);

      selectTab("負債");
      fireEvent.change(screen.getByLabelText("趨勢圖範圍"), {
        target: { value: "7" },
      });
      expect(onRangeChange).toHaveBeenCalledWith(7);

      rerender(
        <TrendSection
          visibleSnapshots={snapshots}
          snapshotCount={2}
          trendRange={7}
          onRangeChange={onRangeChange}
          targetNetWorth={0}
        />
      );

      expect(screen.getByLabelText("趨勢圖範圍")).toHaveValue("7");
      expect(tab("負債")).toHaveAttribute("aria-selected", "true");
      expect(visibleChartTitles()).toEqual(LIABILITY_CHARTS);
    });

    it("選取的分頁只存在記憶體：不寫入 LocalStorage，重新掛載後回到「資產」", () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const { unmount } = renderSection();

      selectTab("配置與儲蓄");
      expect(setItem).not.toHaveBeenCalled();

      unmount();
      renderSection();
      expect(tab("資產")).toHaveAttribute("aria-selected", "true");
      expect(visibleChartTitles()).toEqual(ASSET_CHARTS);
    });
  });

  // 現金趨勢／股票趨勢卡片各自對應快照的 totalCash／totalStockValue，彼此不互相污染
  it("淨資產、現金、股票、負債比卡片各自顯示對應欄位的最新一筆數值", () => {
    const snapshots: Snapshot[] = [
      baseSnapshot({
        date: "2026-01-01",
        cashSources: [
          { id: "c1", name: "現金", amount: 100000, restricted: false },
        ],
        twStockValue: 50000,
      }),
      baseSnapshot({
        date: "2026-01-02",
        cashSources: [
          { id: "c1", name: "現金", amount: 120000, restricted: false },
        ],
        twStockValue: 80000,
        debts: [
          {
            id: "d1",
            name: "信貸",
            category: "信貸",
            principal: 20000,
            annualRate: 0,
            remainingMonths: 12,
            repaymentMethod: "amortizing",
            collateralValue: 0,
          },
        ],
      }),
    ];

    render(
      <TrendSection
        visibleSnapshots={snapshots}
        snapshotCount={2}
        trendRange="all"
        onRangeChange={vi.fn()}
        targetNetWorth={0}
      />
    );

    // 最新一筆：現金 120,000、台股 80,000 → 總資產 200,000、負債 20,000 → 淨資產 180,000、負債比 10%
    expect(
      within(cardFor("淨資產趨勢")).getByText("$180,000")
    ).toBeInTheDocument();
    expect(
      within(cardFor("現金趨勢")).getByText("$120,000")
    ).toBeInTheDocument();
    expect(
      within(cardFor("股票趨勢")).getByText("$80,000")
    ).toBeInTheDocument();

    selectTab("負債");
    expect(
      within(cardFor("負債比趨勢")).getByText("10.0%")
    ).toBeInTheDocument();
  });

  // 目標淨資產參考線只屬於淨資產趨勢圖，現金／股票趨勢圖不應顯示目標線
  const snapshotsForTarget: Snapshot[] = [
    baseSnapshot({ date: "2026-01-01" }),
    baseSnapshot({ date: "2026-01-02" }),
  ];

  it("淨資產趨勢全螢幕檢視顯示目標淨資產參考線", () => {
    render(
      <TrendSection
        visibleSnapshots={snapshotsForTarget}
        snapshotCount={2}
        trendRange="all"
        onRangeChange={vi.fn()}
        targetNetWorth={1000000}
      />
    );

    fireEvent.click(screen.getByLabelText("淨資產趨勢全螢幕檢視"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("目標 $1,000,000")).toBeInTheDocument();
  });

  it("現金趨勢全螢幕檢視不顯示目標參考線", () => {
    render(
      <TrendSection
        visibleSnapshots={snapshotsForTarget}
        snapshotCount={2}
        trendRange="all"
        onRangeChange={vi.fn()}
        targetNetWorth={1000000}
      />
    );

    fireEvent.click(screen.getByLabelText("現金趨勢全螢幕檢視"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText(/^目標/)).not.toBeInTheDocument();
  });

  it("有快照時顯示趨勢圖範圍下拉選單，反映目前選取的範圍", () => {
    render(
      <TrendSection
        visibleSnapshots={[
          baseSnapshot(),
          baseSnapshot({ date: "2026-01-02" }),
        ]}
        snapshotCount={2}
        trendRange={30}
        onRangeChange={vi.fn()}
        targetNetWorth={0}
      />
    );

    expect(screen.getByLabelText("趨勢圖範圍")).toHaveValue("30");
  });

  // PRD 4.2「趨勢圖範圍選項」、第 9 節 #57a
  describe("趨勢圖範圍選項", () => {
    function renderWithRange(
      trendRange: Parameters<typeof TrendSection>[0]["trendRange"]
    ) {
      const onRangeChange = vi.fn();
      render(
        <TrendSection
          visibleSnapshots={[
            baseSnapshot(),
            baseSnapshot({ date: "2026-01-02" }),
          ]}
          snapshotCount={2}
          trendRange={trendRange}
          onRangeChange={onRangeChange}
          targetNetWorth={0}
        />
      );
      return { select: screen.getByLabelText("趨勢圖範圍"), onRangeChange };
    }

    it("選項順序固定為 7 天／30 天／90 天／1 年／今年以來／全部", () => {
      const { select } = renderWithRange(90);

      const options = within(select).getAllByRole("option");
      expect(options.map((option) => option.textContent)).toEqual([
        "7 天",
        "30 天",
        "90 天",
        "1 年",
        "今年以來",
        "全部",
      ]);
      expect(options.map((option) => option.getAttribute("value"))).toEqual([
        "7",
        "30",
        "90",
        "365",
        "ytd",
        "all",
      ]);
    });

    it.each([
      [365, "365", "1 年"],
      ["ytd", "ytd", "今年以來"],
      ["all", "all", "全部"],
    ] as const)(
      "目前範圍為 %s 時，下拉選單顯示「%s」",
      (range, value, label) => {
        const { select } = renderWithRange(range);

        expect(select).toHaveValue(value);
        expect(
          (
            within(select).getByRole("option", {
              name: label,
            }) as HTMLOptionElement
          ).selected
        ).toBe(true);
      }
    );

    it.each([
      ["7", 7],
      ["30", 30],
      ["90", 90],
      ["365", 365],
      ["ytd", "ytd"],
      ["all", "all"],
    ] as const)(
      "選取 value=%s 時，以對應型別的範圍值通知上層（數字天數不會變成字串）",
      (value, expected) => {
        // 起始範圍刻意選一個不同的值，確保每個案例都真的觸發 change
        const { select, onRangeChange } = renderWithRange(
          expected === 7 ? 30 : 7
        );

        fireEvent.change(select, { target: { value } });

        expect(onRangeChange).toHaveBeenCalledTimes(1);
        expect(onRangeChange).toHaveBeenCalledWith(expected);
      }
    );
  });

  // PRD 4.2「儲蓄率趨勢圖」「每月應還款趨勢圖」「資產配置趨勢圖」、第 9 節 #50～#50k
  describe("儲蓄率／每月應還款／資產配置趨勢", () => {
    const debt = (principal: number, months: number) => ({
      id: "d1",
      name: "信貸",
      category: "信貸" as const,
      principal,
      annualRate: 0,
      remainingMonths: months,
      repaymentMethod: "amortizing" as const,
      collateralValue: 0,
    });
    const cash = (amount: number, restricted = false) => ({
      id: `c${amount}${restricted}`,
      name: "銀行",
      amount,
      restricted,
    });

    // S1：收入 100,000、支出 40,000、月付 10,000 → 儲蓄率 50%
    // S2：收入 100,000、支出 30,000、月付 9,000 → 儲蓄率 61%
    const twoSnapshots: Snapshot[] = [
      baseSnapshot({
        date: "2026-01-01",
        cashSources: [cash(100000)],
        twStockValue: 100000,
        incomeSources: [{ id: "i", name: "薪資", amount: 100000 }],
        monthlyExpense: 40000,
        debts: [debt(120000, 12)],
      }),
      baseSnapshot({
        date: "2026-01-02",
        cashSources: [cash(100000)],
        twStockValue: 100000,
        incomeSources: [{ id: "i", name: "薪資", amount: 100000 }],
        monthlyExpense: 30000,
        debts: [debt(90000, 10)],
      }),
    ];

    /** 渲染後切到指定分頁：儲蓄率／資產配置在「配置與儲蓄」（預設），每月應還款在「負債」。 */
    function renderSection(
      visibleSnapshots: Snapshot[],
      tabName: TrendTabName = "配置與儲蓄"
    ) {
      render(
        <TrendSection
          visibleSnapshots={visibleSnapshots}
          snapshotCount={visibleSnapshots.length}
          trendRange="all"
          onRangeChange={vi.fn()}
          targetNetWorth={0}
        />
      );
      selectTab(tabName);
    }

    it("儲蓄率趨勢顯示最新一筆儲蓄率，且不顯示增減比對", () => {
      renderSection(twoSnapshots);

      const card = cardFor("儲蓄率趨勢");
      expect(within(card).getByText("61.0%")).toBeInTheDocument();
      expect(card).not.toHaveTextContent("▲");
      expect(card).not.toHaveTextContent("▼");
    });

    it("儲蓄率為負（入不敷出）時，最新值顯示負的百分比", () => {
      renderSection([
        twoSnapshots[0],
        {
          ...twoSnapshots[1],
          monthlyExpense: 120000, // 100,000 − 120,000 − 9,000 = −29,000
        },
      ]);

      expect(
        within(cardFor("儲蓄率趨勢")).getByText("-29.0%")
      ).toBeInTheDocument();
    });

    it("沒有收入的快照儲蓄率為 0%，不出現 NaN", () => {
      renderSection([
        { ...twoSnapshots[0], incomeSources: [] },
        { ...twoSnapshots[1], incomeSources: [] },
      ]);

      const card = cardFor("儲蓄率趨勢");
      expect(within(card).getByText("0.0%")).toBeInTheDocument();
      expect(card.textContent).not.toContain("NaN");
    });

    it("每月應還款趨勢顯示最新月付，並附與上一筆比對的增減", () => {
      renderSection(twoSnapshots, "負債");

      const card = cardFor("每月應還款趨勢");
      // 最新月付 90,000 ÷ 10 = 9,000；前一筆 120,000 ÷ 12 = 10,000 → 減少 $1,000 (−10.0%)
      expect(within(card).getAllByText("$9,000")[0]).toBeInTheDocument();
      expect(card).toHaveTextContent("▼ $1,000 (-10.0%)");
    });

    it("每月應還款以各筆快照自己的負債計算，不受其他快照影響", () => {
      renderSection(
        [twoSnapshots[0], { ...twoSnapshots[1], debts: [] }],
        "負債"
      );

      expect(
        within(cardFor("每月應還款趨勢")).getAllByText("$0")[0]
      ).toBeInTheDocument();
    });

    it("資產配置趨勢圖例顯示最新一筆各類占比", () => {
      renderSection(twoSnapshots);

      const legend = within(cardFor("資產配置趨勢")).getByTestId(
        "allocation-legend"
      );
      // 現金 100,000、台股 100,000 → 各 50%，美股 0%
      expect(legend).toHaveTextContent("現金 50.0%");
      expect(legend).toHaveTextContent("台股 50.0%");
      expect(legend).toHaveTextContent("美股 0.0%");
    });

    it("資產配置占比以金融資產為分母，不含不動產", () => {
      renderSection(
        twoSnapshots.map((s) => ({ ...s, realEstateValue: 10000000 }))
      );

      expect(
        within(cardFor("資產配置趨勢")).getByTestId("allocation-legend")
      ).toHaveTextContent("現金 50.0%");
    });

    // PRD 第 9 節 #50g
    it("金融資產為 0 的快照不納入資產配置趨勢；納入後不足 2 筆時顯示空狀態，其他圖照常", () => {
      renderSection([
        baseSnapshot({ date: "2026-01-01", realEstateValue: 5000000 }),
        twoSnapshots[1],
      ]);

      expect(
        within(cardFor("資產配置趨勢")).getByText("持續使用滿 2 天即可查看趨勢")
      ).toBeInTheDocument();
      expect(
        within(cardFor("儲蓄率趨勢")).queryByText("持續使用滿 2 天即可查看趨勢")
      ).not.toBeInTheDocument();
    });

    it("可動用現金占比為負（不可動用現金大於總現金）的快照不納入資產配置趨勢", () => {
      const negativeLiquid = {
        ...twoSnapshots[1],
        cashSources: [cash(-20000), cash(100000, true)],
        twStockValue: 50000,
      };
      renderSection([twoSnapshots[0], negativeLiquid]);

      expect(
        within(cardFor("資產配置趨勢")).getByText("持續使用滿 2 天即可查看趨勢")
      ).toBeInTheDocument();
    });

    it("被排除的快照仍會出現在其他趨勢圖（只排除資產配置圖）", () => {
      renderSection(
        [
          baseSnapshot({ date: "2026-01-01", realEstateValue: 5000000 }),
          twoSnapshots[1],
        ],
        "資產"
      );

      // 淨資產趨勢含 2 個節點，所以有圖而不是空狀態
      expect(
        within(cardFor("淨資產趨勢")).queryByText("持續使用滿 2 天即可查看趨勢")
      ).not.toBeInTheDocument();
    });

    it("不可動用現金只在有值的期間出現於資產配置圖", () => {
      renderSection([
        twoSnapshots[0],
        {
          ...twoSnapshots[1],
          cashSources: [cash(60000), cash(40000, true)],
        },
      ]);

      expect(
        screen.getByTestId("allocation-layer-restrictedCash")
      ).toBeInTheDocument();
      expect(
        within(cardFor("資產配置趨勢")).getByTestId("allocation-legend")
      ).toHaveTextContent("不可動用現金 20.0%");
    });

    it("三張新卡片都提供全螢幕展開按鈕", () => {
      renderSection(twoSnapshots);

      expect(
        screen.getByLabelText("資產配置趨勢全螢幕檢視")
      ).toBeInTheDocument();
      expect(screen.getByLabelText("儲蓄率趨勢全螢幕檢視")).toBeInTheDocument();

      selectTab("負債");
      expect(
        screen.getByLabelText("每月應還款趨勢全螢幕檢視")
      ).toBeInTheDocument();
    });

    // PRD 第 9 節 #50l：沿用折線圖元件的 Y 軸刻度
    it("儲蓄率趨勢全螢幕檢視顯示 Y 軸刻度，且不畫目標參考線", () => {
      render(
        <TrendSection
          visibleSnapshots={twoSnapshots}
          snapshotCount={2}
          trendRange="all"
          onRangeChange={vi.fn()}
          targetNetWorth={1000000}
        />
      );
      selectTab("配置與儲蓄");

      fireEvent.click(screen.getByLabelText("儲蓄率趨勢全螢幕檢視"));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("50.0%")).toBeInTheDocument();
      expect(within(dialog).queryByText(/^目標/)).not.toBeInTheDocument();
    });
  });

  // PRD 4.2「淨資產成長率與最大回撤」、第 9 節 #14k～#14n
  describe("淨資產成長率與最大回撤摘要", () => {
    const cashSnapshot = (date: string, amount: number) =>
      baseSnapshot({
        date,
        cashSources: [{ id: "c1", name: "現金", amount, restricted: false }],
      });

    // 2020-01-01 → 2024-01-01 = 1461 天；1,000,000 → 1,464,100（1.1^4）→ 年化 10%
    const fourYears = [
      cashSnapshot("2020-01-01", 1_000_000),
      cashSnapshot("2021-01-01", 1_200_000),
      cashSnapshot("2022-01-01", 900_000),
      cashSnapshot("2024-01-01", 1_464_100),
    ];

    function renderSection(visibleSnapshots: Snapshot[], snapshotCount = 4) {
      return render(
        <TrendSection
          visibleSnapshots={visibleSnapshots}
          snapshotCount={snapshotCount}
          trendRange="all"
          onRangeChange={vi.fn()}
          targetNetWorth={0}
        />
      );
    }

    it("以範圍內的快照計算，顯示在範圍下拉選單之後、分頁列之前", () => {
      renderSection(fourYears);

      const summary = screen.getByTestId("net-worth-performance");
      expect(summary).toHaveTextContent("2020-01-01 ～ 2024-01-01");
      expect(screen.getByTestId("net-worth-growth-value")).toHaveTextContent(
        "▲ 10.0%"
      );
      expect(screen.getByTestId("net-worth-drawdown-value")).toHaveTextContent(
        "▼ 25.0%"
      );

      const following = Node.DOCUMENT_POSITION_FOLLOWING;
      expect(
        screen.getByLabelText("趨勢圖範圍").compareDocumentPosition(summary) &
          following
      ).toBeTruthy();
      expect(
        summary.compareDocumentPosition(screen.getByRole("tablist")) & following
      ).toBeTruthy();
    });

    it("範圍改變（傳入的快照不同）時跟著重算", () => {
      const { rerender } = renderSection(fourYears);
      expect(screen.getByTestId("net-worth-growth-label")).toHaveTextContent(
        "年化成長率"
      );

      // 範圍縮小到只剩 2020～2021：366 天，1,000,000 → 1,200,000，沒有回撤
      rerender(
        <TrendSection
          visibleSnapshots={fourYears.slice(0, 2)}
          snapshotCount={4}
          trendRange={365}
          onRangeChange={vi.fn()}
          targetNetWorth={0}
        />
      );

      expect(screen.getByTestId("net-worth-performance")).toHaveTextContent(
        "2020-01-01 ～ 2021-01-01（366 天）"
      );
      expect(screen.getByTestId("net-worth-change-value")).toHaveTextContent(
        "▲ $200,000"
      );
      expect(screen.getByTestId("net-worth-drawdown-value")).toHaveTextContent(
        "期間內沒有回撤"
      );
    });

    it("範圍內少於 2 筆時不顯示摘要，趨勢圖維持原本的空狀態", () => {
      renderSection([fourYears[3]]);

      expect(
        screen.queryByTestId("net-worth-performance")
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("趨勢圖範圍")).toBeInTheDocument();
      expect(screen.getAllByText("持續使用滿 2 天即可查看趨勢")).toHaveLength(
        3
      );
    });

    it("尚無任何快照時不顯示摘要", () => {
      renderSection([], 0);

      expect(
        screen.queryByTestId("net-worth-performance")
      ).not.toBeInTheDocument();
    });

    it("切換分頁後摘要仍在（不屬於任何一個分頁）", () => {
      renderSection(fourYears);

      selectTab("負債");
      expect(screen.getByTestId("net-worth-performance")).toBeInTheDocument();
      expect(visibleChartTitles()).toEqual(LIABILITY_CHARTS);

      selectTab("配置與儲蓄");
      expect(screen.getByTestId("net-worth-performance")).toBeInTheDocument();
      expect(visibleChartTitles()).toEqual(ALLOCATION_CHARTS);
    });
  });

  // PRD 4.2「快照備註」第 5、9 點、第 9 節 #72e、#72f
  describe("快照備註", () => {
    function renderWithNotes() {
      const snapshots = [
        baseSnapshot({
          date: "2026-01-01",
          cashSources: [
            { id: "c", name: "銀行", amount: 100000, restricted: false },
          ],
          twStockValue: 100000,
        }),
        baseSnapshot({
          date: "2026-02-01",
          cashSources: [
            { id: "c", name: "銀行", amount: 150000, restricted: false },
          ],
          twStockValue: 120000,
          // 顯示時套用與存檔相同的正規化
          note: "  換工作 \n 加薪 ",
        }),
        baseSnapshot({
          date: "2026-03-01",
          cashSources: [
            { id: "c", name: "銀行", amount: 180000, restricted: false },
          ],
          twStockValue: 130000,
          note: "   ",
        }),
      ];
      render(
        <TrendSection
          visibleSnapshots={snapshots}
          snapshotCount={snapshots.length}
          trendRange="all"
          onRangeChange={vi.fn()}
          targetNetWorth={0}
        />
      );
    }

    function markerIds(card: HTMLElement) {
      return Array.from(
        card.querySelectorAll('[data-testid^="chart-note-marker-"]')
      ).map((marker) => marker.getAttribute("data-testid"));
    }

    function tooltipNote(card: HTMLElement, index: number) {
      fireEvent.click(within(card).getByTestId(`chart-node-${index}`));
      return within(card).queryByTestId("chart-tooltip-note")?.textContent;
    }

    it("八張趨勢圖都只在有備註的節點畫標記，Tooltip 顯示正規化後的備註", () => {
      renderWithNotes();

      const groups: [TrendTabName, string[]][] = [
        ["資產", ASSET_CHARTS],
        ["負債", LIABILITY_CHARTS],
        ["配置與儲蓄", ALLOCATION_CHARTS],
      ];
      for (const [name, titles] of groups) {
        selectTab(name);
        for (const title of titles) {
          const card = cardFor(title);
          expect(markerIds(card), title).toEqual(["chart-note-marker-1"]);
          expect(tooltipNote(card, 1), title).toBe("備註：換工作 加薪");
          // 只有空白的備註視為沒有備註
          expect(tooltipNote(card, 2), title).toBeUndefined();
        }
      }
    });

    it("沒有任何備註時不畫標記", () => {
      render(
        <TrendSection
          visibleSnapshots={[
            baseSnapshot({ date: "2026-01-01", twStockValue: 100000 }),
            baseSnapshot({ date: "2026-02-01", twStockValue: 120000 }),
          ]}
          snapshotCount={2}
          trendRange="all"
          onRangeChange={vi.fn()}
          targetNetWorth={0}
        />
      );

      expect(
        document.querySelector('[data-testid^="chart-note-marker-"]')
      ).toBeNull();
    });
  });
});
