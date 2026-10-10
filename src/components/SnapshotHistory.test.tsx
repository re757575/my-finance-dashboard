import {
  fireEvent,
  render as renderCollapsed,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SnapshotHistory } from "@/components/SnapshotHistory";
import { calculateMetrics } from "@/lib/calculations";
import type { Debt, Snapshot } from "@/types/schema";
import { createEmptySnapshot } from "@/types/schema";

const toggle = () => screen.getByRole("button", { name: "歷史快照" });

/**
 * 區塊預設收合（PRD 4.2「快照比較與歷史快照預設收合」）：既有案例檢查的都是展開後的內容，
 * 渲染後先展開；要檢查收合狀態的案例改用 `renderCollapsed`。
 */
function render(ui: ReactElement) {
  const view = renderCollapsed(ui);
  fireEvent.click(toggle());
  return view;
}

// 包一層 spy 以計算 calculateMetrics 的呼叫次數，行為與原函式完全相同
vi.mock("@/lib/calculations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calculations")>();
  return { ...actual, calculateMetrics: vi.fn(actual.calculateMetrics) };
});

function snap(
  date: string,
  cash: number,
  debts: Debt[] = [],
  twStockValue = 0
): Snapshot {
  return {
    ...createEmptySnapshot(date),
    updatedAt: `${date}T00:00:00.000Z`,
    cashSources: [{ id: "c", name: "銀行", amount: cash, restricted: false }],
    twStockValue,
    debts,
  };
}

function debt(principal: number): Debt {
  return {
    id: "d",
    name: "信貸",
    category: "信貸",
    principal,
    annualRate: 0,
    remainingMonths: 12,
    repaymentMethod: "amortizing",
    collateralValue: 0,
  };
}

function manySnapshots(count: number): Snapshot[] {
  return Array.from({ length: count }, (_, i) =>
    snap(`2026-01-${String(i + 1).padStart(2, "0")}`, (i + 1) * 1000)
  );
}

function renderHistory(
  props: Partial<React.ComponentProps<typeof SnapshotHistory>> = {}
) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(
    <SnapshotHistory
      snapshots={[]}
      currentDate="2026-09-30"
      editingDate={null}
      onEdit={onEdit}
      onDelete={onDelete}
      {...props}
    />
  );
  return { onEdit, onDelete };
}

function rowDates(): string[] {
  return screen
    .queryAllByTestId(/^snapshot-row-/)
    .map((el) => el.getAttribute("data-testid")!.replace("snapshot-row-", ""));
}

describe("SnapshotHistory", () => {
  // PRD 第 9 節 #48a
  it("沒有快照時顯示「尚未有已存檔的快照」，除了標題的收合鈕沒有其他按鈕", () => {
    renderHistory();

    expect(screen.getByTestId("snapshot-history-empty")).toHaveTextContent(
      "尚未有已存檔的快照"
    );
    expect(screen.getAllByRole("button")).toEqual([toggle()]);
  });

  // PRD 第 9 節 #48
  it("依日期由新到舊排序，與傳入順序無關", () => {
    renderHistory({
      snapshots: [
        snap("2026-02-01", 1),
        snap("2026-03-01", 1),
        snap("2026-01-01", 1),
      ],
    });

    expect(rowDates()).toEqual(["2026-03-01", "2026-02-01", "2026-01-01"]);
  });

  it("不會修改傳入的 snapshots 陣列（不就地排序）", () => {
    const input = [snap("2026-01-01", 1), snap("2026-03-01", 1)];
    renderHistory({ snapshots: input });

    expect(input.map((s) => s.date)).toEqual(["2026-01-01", "2026-03-01"]);
  });

  it("每列顯示該筆快照自己算出的淨資產與總資產", () => {
    renderHistory({
      snapshots: [snap("2026-01-01", 1000000, [debt(300000)], 500000)],
    });

    const row = screen.getByTestId("snapshot-row-2026-01-01");
    // 總資產 = 1,000,000 + 500,000；淨資產 = 1,500,000 − 300,000
    expect(row).toHaveTextContent("淨資產 $1,200,000");
    expect(row).toHaveTextContent("總資產 $1,500,000");
  });

  it("淨資產為負數時以紅色呈現", () => {
    renderHistory({ snapshots: [snap("2026-01-01", 100000, [debt(500000)])] });

    const row = screen.getByTestId("snapshot-row-2026-01-01");
    expect(screen.getByText("-$400,000")).toHaveClass("text-rose-600");
    expect(row).toHaveTextContent("淨資產 -$400,000");
  });

  it("今天的那筆標註「今天」且沒有「修正」按鈕，仍可刪除；其他日期都有兩個按鈕", () => {
    renderHistory({
      snapshots: [snap("2026-09-30", 1), snap("2026-09-20", 1)],
    });

    const today = screen.getByTestId("snapshot-row-2026-09-30");
    expect(today).toHaveTextContent("今天");
    expect(
      screen.queryByRole("button", { name: "修正 2026-09-30 的快照" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "刪除 2026-09-30 的快照" })
    ).toBeInTheDocument();

    const past = screen.getByTestId("snapshot-row-2026-09-20");
    expect(past).not.toHaveTextContent("今天");
    expect(
      screen.getByRole("button", { name: "修正 2026-09-20 的快照" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "刪除 2026-09-20 的快照" })
    ).toBeInTheDocument();
  });

  it("正在修正的那一列標註「修正中」，其他列沒有", () => {
    renderHistory({
      snapshots: [snap("2026-09-20", 1), snap("2026-09-10", 1)],
      editingDate: "2026-09-10",
    });

    expect(screen.getByTestId("snapshot-row-2026-09-10")).toHaveTextContent(
      "修正中"
    );
    expect(screen.getByTestId("snapshot-row-2026-09-20")).not.toHaveTextContent(
      "修正中"
    );
  });

  it("點擊「修正」會以該日期呼叫 onEdit", () => {
    const { onEdit } = renderHistory({
      snapshots: [snap("2026-09-20", 1), snap("2026-09-10", 1)],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "修正 2026-09-10 的快照" })
    );

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("2026-09-10");
  });

  describe("預設只顯示最新 10 筆", () => {
    it("超過 10 筆時只顯示最新 10 筆，並提供「顯示全部（N 筆）」", () => {
      renderHistory({ snapshots: manySnapshots(12) });

      expect(rowDates()).toHaveLength(10);
      // 最新 10 筆：01-12 ～ 01-03
      expect(rowDates()[0]).toBe("2026-01-12");
      expect(rowDates().at(-1)).toBe("2026-01-03");
      expect(
        screen.getByRole("button", { name: "顯示全部（12 筆）" })
      ).toBeInTheDocument();
    });

    it("點擊「顯示全部」展開全部，再點擊「收合」回到 10 筆", () => {
      renderHistory({ snapshots: manySnapshots(12) });

      fireEvent.click(
        screen.getByRole("button", { name: "顯示全部（12 筆）" })
      );
      expect(rowDates()).toHaveLength(12);

      fireEvent.click(screen.getByRole("button", { name: "收合" }));
      expect(rowDates()).toHaveLength(10);
    });

    it("恰好 10 筆或更少時不顯示展開按鈕", () => {
      renderHistory({ snapshots: manySnapshots(10) });

      expect(rowDates()).toHaveLength(10);
      expect(screen.queryByText(/顯示全部/)).not.toBeInTheDocument();
    });
  });

  // PRD 第 9 節 #49、#49a
  describe("刪除二次確認", () => {
    it("點擊「刪除」只開啟確認對話框（標題含日期與無法復原說明），尚未呼叫 onDelete", () => {
      const { onDelete } = renderHistory({
        snapshots: [snap("2026-09-20", 1), snap("2026-09-10", 1)],
      });

      fireEvent.click(
        screen.getByRole("button", { name: "刪除 2026-09-10 的快照" })
      );

      expect(
        screen.getByText("確認刪除 2026-09-10 的快照？")
      ).toBeInTheDocument();
      expect(
        screen.getByText(/此操作無法復原，趨勢圖會少一個節點，建議先匯出備份/)
      ).toBeInTheDocument();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it("按「取消」關閉對話框，不刪除", () => {
      const { onDelete } = renderHistory({
        snapshots: [snap("2026-09-10", 1)],
      });
      fireEvent.click(
        screen.getByRole("button", { name: "刪除 2026-09-10 的快照" })
      );

      fireEvent.click(screen.getByRole("button", { name: "取消" }));

      expect(
        screen.queryByText("確認刪除 2026-09-10 的快照？")
      ).not.toBeInTheDocument();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it("按「確認刪除」以該日期呼叫一次 onDelete，並關閉對話框", () => {
      const { onDelete } = renderHistory({
        snapshots: [snap("2026-09-20", 1), snap("2026-09-10", 1)],
      });
      fireEvent.click(
        screen.getByRole("button", { name: "刪除 2026-09-10 的快照" })
      );

      fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledWith("2026-09-10");
      expect(
        screen.queryByText("確認刪除 2026-09-10 的快照？")
      ).not.toBeInTheDocument();
    });

    it("今天的快照也可以刪除（同樣需二次確認）", () => {
      const { onDelete } = renderHistory({
        snapshots: [snap("2026-09-30", 1)],
      });

      fireEvent.click(
        screen.getByRole("button", { name: "刪除 2026-09-30 的快照" })
      );
      fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

      expect(onDelete).toHaveBeenCalledWith("2026-09-30");
    });
  });

  // PRD 4.2「歷史快照清單」第 6 點：展開後在固定高度內捲動
  describe("展開後的捲動", () => {
    it("收合時不設高度上限、不出現捲軸，也不可聚焦", () => {
      renderHistory({ snapshots: manySnapshots(12) });

      const list = screen.getByTestId("snapshot-history-list");
      expect(list).not.toHaveClass("overflow-y-auto");
      expect(list).not.toHaveClass("max-h-96");
      expect(list).not.toHaveAttribute("tabindex");
      expect(list).not.toHaveAttribute("aria-label");
    });

    // PRD 第 9 節 #48k
    it("展開後套用高度上限（24rem）與垂直捲動，收合後移除", () => {
      renderHistory({ snapshots: manySnapshots(12) });

      fireEvent.click(
        screen.getByRole("button", { name: "顯示全部（12 筆）" })
      );
      const list = screen.getByTestId("snapshot-history-list");
      expect(list).toHaveClass("max-h-96");
      expect(list).toHaveClass("overflow-y-auto");

      fireEvent.click(screen.getByRole("button", { name: "收合" }));
      expect(screen.getByTestId("snapshot-history-list")).not.toHaveClass(
        "overflow-y-auto"
      );
    });

    // PRD 第 9 節 #48l
    it("展開後的捲動區可用鍵盤聚焦，並標示為「歷史快照清單」", () => {
      renderHistory({ snapshots: manySnapshots(12) });
      fireEvent.click(
        screen.getByRole("button", { name: "顯示全部（12 筆）" })
      );

      const list = screen.getByRole("list", { name: "歷史快照清單" });
      expect(list).toHaveAttribute("tabindex", "0");
      list.focus();
      expect(list).toHaveFocus();
    });

    it("展開後清單仍列出全部快照（捲動區內含所有列）", () => {
      renderHistory({ snapshots: manySnapshots(400) });

      fireEvent.click(
        screen.getByRole("button", { name: "顯示全部（400 筆）" })
      );

      const list = screen.getByTestId("snapshot-history-list");
      expect(rowDates()).toHaveLength(400);
      expect(
        list.querySelectorAll('[data-testid^="snapshot-row-"]')
      ).toHaveLength(400);
    });
  });

  // PRD 4.2「歷史快照清單」第 7 點、第 9 節 #48m：輸入造成的重新渲染不得重算
  describe("效能：每列指標只在必要時重算", () => {
    beforeEach(() => {
      vi.mocked(calculateMetrics).mockClear();
    });

    function renderWithRerender(snapshots: Snapshot[]) {
      const props = {
        currentDate: "2026-09-30",
        editingDate: null,
        onDelete: vi.fn(),
      };
      const view = render(
        <SnapshotHistory snapshots={snapshots} onEdit={vi.fn()} {...props} />
      );
      return {
        rerender: () =>
          // 每次傳入新的 onEdit（模擬 App 每次輸入都重新渲染），snapshots 維持同一個陣列
          view.rerender(
            <SnapshotHistory
              snapshots={snapshots}
              onEdit={vi.fn()}
              {...props}
            />
          ),
      };
    }

    it("未按「顯示全部」時只為顯示的 10 筆計算指標", () => {
      renderWithRerender(manySnapshots(400));

      expect(calculateMetrics).toHaveBeenCalledTimes(10);
    });

    it("快照資料不變的重新渲染（例如表單輸入）不會重新計算", () => {
      const snapshots = manySnapshots(12);
      const { rerender } = renderWithRerender(snapshots);
      const callsAfterFirstRender =
        vi.mocked(calculateMetrics).mock.calls.length;

      rerender();
      rerender();
      rerender();

      expect(vi.mocked(calculateMetrics)).toHaveBeenCalledTimes(
        callsAfterFirstRender
      );
    });

    it("展開時才為全部快照計算一次，之後的重新渲染不再重算", () => {
      const snapshots = manySnapshots(12);
      const { rerender } = renderWithRerender(snapshots);
      vi.mocked(calculateMetrics).mockClear();

      fireEvent.click(
        screen.getByRole("button", { name: "顯示全部（12 筆）" })
      );
      expect(calculateMetrics).toHaveBeenCalledTimes(12);

      rerender();
      expect(calculateMetrics).toHaveBeenCalledTimes(12);
    });

    it("快照資料改變（例如修正後存檔）時才重新計算", () => {
      const first = manySnapshots(3);
      const view = render(
        <SnapshotHistory
          snapshots={first}
          currentDate="2026-09-30"
          editingDate={null}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      vi.mocked(calculateMetrics).mockClear();

      view.rerender(
        <SnapshotHistory
          snapshots={[...first.slice(0, 2), snap("2026-01-03", 999999)]}
          currentDate="2026-09-30"
          editingDate={null}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(calculateMetrics).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId("snapshot-row-2026-01-03")).toHaveTextContent(
        "$999,999"
      );
    });
  });
});

// PRD 4.2「快照比較與歷史快照預設收合」、第 9 節 #66a～#66f
describe("SnapshotHistory：預設收合", () => {
  const props = {
    currentDate: "2026-09-30",
    editingDate: null,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(calculateMetrics).mockClear();
  });

  it("預設只顯示標題，不渲染清單與操作按鈕，也不計算各列指標", () => {
    renderCollapsed(
      <SnapshotHistory snapshots={manySnapshots(12)} {...props} />
    );

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByTestId("snapshot-history-list")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^刪除 / })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /顯示全部/ })
    ).not.toBeInTheDocument();
    expect(calculateMetrics).not.toHaveBeenCalled();
  });

  it("點擊標題展開，再點一次收合", () => {
    renderCollapsed(
      <SnapshotHistory snapshots={manySnapshots(3)} {...props} />
    );

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("snapshot-history-list")).toBeInTheDocument();

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByTestId("snapshot-history-list")
    ).not.toBeInTheDocument();
  });

  it("收合再展開後，「顯示全部」的狀態維持不變", () => {
    renderCollapsed(
      <SnapshotHistory snapshots={manySnapshots(12)} {...props} />
    );
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "顯示全部（12 筆）" }));
    expect(screen.getAllByTestId(/^snapshot-row-/)).toHaveLength(12);

    fireEvent.click(toggle());
    fireEvent.click(toggle());

    expect(screen.getAllByTestId(/^snapshot-row-/)).toHaveLength(12);
  });

  it("空狀態提示同樣要展開才看得到", () => {
    renderCollapsed(<SnapshotHistory snapshots={[]} {...props} />);
    expect(
      screen.queryByTestId("snapshot-history-empty")
    ).not.toBeInTheDocument();

    fireEvent.click(toggle());
    expect(screen.getByTestId("snapshot-history-empty")).toBeInTheDocument();
  });

  it("修正中的快照不會讓區塊自動展開", () => {
    renderCollapsed(
      <SnapshotHistory
        snapshots={manySnapshots(3)}
        {...props}
        editingDate="2026-01-02"
      />
    );
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });
});
