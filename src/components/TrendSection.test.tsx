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
  it("尚無快照時，五張卡片皆顯示空狀態提示，且不顯示範圍下拉選單", () => {
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
    expect(screen.getAllByText("持續使用滿 2 天即可查看趨勢")).toHaveLength(5);
    expect(screen.queryByLabelText("趨勢圖範圍")).not.toBeInTheDocument();
  });

  // 現金趨勢／股票趨勢卡片各自對應快照的 totalCash／totalStockValue，彼此不互相污染
  it("淨資產、現金、股票、負債比卡片各自顯示對應欄位的最新一筆數值", () => {
    const snapshots: Snapshot[] = [
      baseSnapshot({
        date: "2026-01-01",
        cashSources: [{ id: "c1", name: "現金", amount: 100000 }],
        twStockValue: 50000,
      }),
      baseSnapshot({
        date: "2026-01-02",
        cashSources: [{ id: "c1", name: "現金", amount: 120000 }],
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
});
