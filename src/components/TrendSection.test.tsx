import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrendSection } from "@/components/TrendSection";
import type { Snapshot } from "@/types/schema";

function baseSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    date: "2026-01-01",
    updatedAt: "2026-01-01T09:00:00.000Z",
    cashSources: [],
    twStockValue: 0,
    usStockValue: 0,
    usStockCurrency: "USD",
    exchangeRate: 0,
    realEstateValue: 0,
    debts: [],
    incomeSources: [],
    monthlyExpense: 0,
    targetNetWorth: 0,
    targetCashRatio: 0,
    ...overrides,
  };
}

function cardFor(title: string) {
  return screen.getByText(title).closest(".rounded-xl") as HTMLElement;
}

describe("TrendSection", () => {
  it("尚無快照時，八張卡片皆顯示空狀態提示，且不顯示範圍下拉選單", () => {
    render(
      <TrendSection
        visibleSnapshots={[]}
        snapshotCount={0}
        trendRange="all"
        onRangeChange={vi.fn()}
        targetNetWorth={0}
      />
    );

    expect(screen.getByText("淨資產趨勢")).toBeInTheDocument();
    expect(screen.getByText("現金趨勢")).toBeInTheDocument();
    expect(screen.getByText("股票趨勢")).toBeInTheDocument();
    expect(screen.getByText("負債比趨勢")).toBeInTheDocument();
    expect(screen.getByText("資產配置趨勢")).toBeInTheDocument();
    expect(screen.getByText("儲蓄率趨勢")).toBeInTheDocument();
    expect(screen.getByText("每月應還款趨勢")).toBeInTheDocument();
    expect(screen.getAllByText("持續使用滿 2 天即可查看趨勢")).toHaveLength(8);
    expect(screen.queryByLabelText("趨勢圖範圍")).not.toBeInTheDocument();
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

    function renderSection(visibleSnapshots: Snapshot[]) {
      render(
        <TrendSection
          visibleSnapshots={visibleSnapshots}
          snapshotCount={visibleSnapshots.length}
          trendRange="all"
          onRangeChange={vi.fn()}
          targetNetWorth={0}
        />
      );
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
      renderSection(twoSnapshots);

      const card = cardFor("每月應還款趨勢");
      // 最新月付 90,000 ÷ 10 = 9,000；前一筆 120,000 ÷ 12 = 10,000 → 減少 $1,000 (−10.0%)
      expect(within(card).getAllByText("$9,000")[0]).toBeInTheDocument();
      expect(card).toHaveTextContent("▼ $1,000 (-10.0%)");
    });

    it("每月應還款以各筆快照自己的負債計算，不受其他快照影響", () => {
      renderSection([twoSnapshots[0], { ...twoSnapshots[1], debts: [] }]);

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
      renderSection([
        baseSnapshot({ date: "2026-01-01", realEstateValue: 5000000 }),
        twoSnapshots[1],
      ]);

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

      fireEvent.click(screen.getByLabelText("儲蓄率趨勢全螢幕檢視"));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("50.0%")).toBeInTheDocument();
      expect(within(dialog).queryByText(/^目標/)).not.toBeInTheDocument();
    });
  });
});
