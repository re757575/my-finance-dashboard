import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SnapshotComparison } from "@/components/SnapshotComparison";
import { compareSnapshots } from "@/lib/snapshotComparison";
import type { CashSource, Debt, Snapshot } from "@/types/schema";
import { createEmptySnapshot } from "@/types/schema";

// 包一層 spy 以計算 compareSnapshots 的呼叫次數，行為與原函式完全相同
vi.mock("@/lib/snapshotComparison", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/snapshotComparison")>();
  return { ...actual, compareSnapshots: vi.fn(actual.compareSnapshots) };
});

function cash(id: string, name: string, amount: number): CashSource {
  return { id, name, amount, restricted: false };
}

function debt(id: string, name: string, principal: number): Debt {
  return {
    id,
    name,
    category: "信貸",
    principal,
    annualRate: 0,
    remainingMonths: 12,
    repaymentMethod: "amortizing",
    collateralValue: 0,
  };
}

function snap(date: string, patch: Partial<Snapshot> = {}): Snapshot {
  return {
    ...createEmptySnapshot(date),
    updatedAt: `${date}T00:00:00.000Z`,
    ...patch,
  };
}

// PRD 第 9 節 #55c 的情境，再多一筆較早的快照
const JULY = snap("2026-07-31", {
  cashSources: [cash("c1", "銀行", 80000)],
  twStockValue: 200000,
  debts: [debt("d1", "信貸", 60000)],
});
const AUGUST = snap("2026-08-31", {
  cashSources: [cash("c1", "銀行", 100000)],
  twStockValue: 200000,
  debts: [debt("d1", "信貸", 50000)],
});
const SEPTEMBER = snap("2026-09-30", {
  cashSources: [cash("c1", "銀行", 150000)],
  twStockValue: 180000,
  debts: [debt("d1", "信貸", 40000)],
});

function baseSelect() {
  return screen.getByLabelText<HTMLSelectElement>("比較基準日");
}

function targetSelect() {
  return screen.getByLabelText<HTMLSelectElement>("比較對象日");
}

function row(key: string) {
  return screen.getByTestId(`comparison-row-${key}`);
}

beforeEach(() => {
  vi.mocked(compareSnapshots).mockClear();
});

// PRD 4.2「快照比較」、第 9 節 #55a～#55l
describe("SnapshotComparison", () => {
  describe("筆數不足", () => {
    // #55a
    it("沒有快照時顯示提示文字，沒有下拉選單與表格", () => {
      render(<SnapshotComparison snapshots={[]} />);

      expect(screen.getByTestId("snapshot-comparison-empty")).toHaveTextContent(
        "至少需要 2 筆已存檔的快照才能比較"
      );
      expect(screen.queryByLabelText("比較基準日")).not.toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    // #55a
    it("只有 1 筆快照時同樣顯示提示文字", () => {
      render(<SnapshotComparison snapshots={[SEPTEMBER]} />);

      expect(
        screen.getByTestId("snapshot-comparison-empty")
      ).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
  });

  describe("預設選取與下拉選單", () => {
    // #55b
    it("預設「從」為倒數第二筆、「到」為最新一筆，與傳入順序無關", () => {
      render(<SnapshotComparison snapshots={[SEPTEMBER, JULY, AUGUST]} />);

      expect(baseSelect().value).toBe("2026-08-31");
      expect(targetSelect().value).toBe("2026-09-30");
      expect(
        screen.getByRole("columnheader", { name: "2026-08-31" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("columnheader", { name: "2026-09-30" })
      ).toBeInTheDocument();
    });

    it("選項為全部快照的日期，由新到舊", () => {
      render(<SnapshotComparison snapshots={[JULY, AUGUST, SEPTEMBER]} />);

      for (const select of [baseSelect(), targetSelect()]) {
        expect(
          within(select)
            .getAllByRole("option")
            .map((option) => option.textContent)
        ).toEqual(["2026-09-30", "2026-08-31", "2026-07-31"]);
      }
    });

    it("新增快照後，未手動選過的日期自動跟到最新", () => {
      const { rerender } = render(
        <SnapshotComparison snapshots={[JULY, AUGUST]} />
      );
      expect(targetSelect().value).toBe("2026-08-31");

      rerender(<SnapshotComparison snapshots={[JULY, AUGUST, SEPTEMBER]} />);

      expect(baseSelect().value).toBe("2026-08-31");
      expect(targetSelect().value).toBe("2026-09-30");
    });
  });

  describe("表格內容", () => {
    // #55c
    it("逐項顯示基準日數值、對象日數值與增減", () => {
      render(<SnapshotComparison snapshots={[JULY, AUGUST, SEPTEMBER]} />);

      expect(row("net-worth")).toHaveTextContent(
        "淨資產$250,000$290,000▲ $40,000 (+16.0%)"
      );
      expect(row("total-assets")).toHaveTextContent(
        "總資產$300,000$330,000▲ $30,000 (+10.0%)"
      );
      expect(row("total-liabilities")).toHaveTextContent(
        "總負債$50,000$40,000▼ $10,000 (-20.0%)"
      );
      expect(row("cash")).toHaveTextContent(
        "現金合計$100,000$150,000▲ $50,000 (+50.0%)"
      );
      expect(row("tw-stock")).toHaveTextContent(
        "台股市值$200,000$180,000▼ $20,000 (-10.0%)"
      );
      expect(row("cash-source-c1")).toHaveTextContent(
        "銀行$100,000$150,000▲ $50,000 (+50.0%)"
      );
      expect(row("debt-d1")).toHaveTextContent(
        "信貸（信貸）$50,000$40,000▼ $10,000 (-20.0%)"
      );
    });

    // #55d
    it("負債比以百分點表示增減，不顯示相對百分比", () => {
      render(
        <SnapshotComparison
          snapshots={[
            snap("2026-08-31", {
              cashSources: [cash("c1", "銀行", 200000)],
              debts: [debt("d1", "信貸", 50000)],
            }),
            snap("2026-09-30", {
              cashSources: [cash("c1", "銀行", 200000)],
              debts: [debt("d1", "信貸", 40000)],
            }),
          ]}
        />
      );

      expect(row("debt-ratio")).toHaveTextContent(
        "負債比25.0%20.0%▼ 5.0 個百分點"
      );
      expect(row("debt-ratio")).not.toHaveTextContent("(");
    });

    it("分為總覽、資產、現金來源、負債四組", () => {
      render(<SnapshotComparison snapshots={[AUGUST, SEPTEMBER]} />);

      for (const title of ["總覽", "資產", "現金來源", "負債"]) {
        expect(
          screen.getByRole("columnheader", { name: title })
        ).toBeInTheDocument();
      }
    });

    // #55f
    it("數值相同顯示「持平」；基準值為 0 時只顯示增減金額", () => {
      render(
        <SnapshotComparison
          snapshots={[
            snap("2026-08-31", { cashSources: [cash("c1", "銀行", 1000)] }),
            snap("2026-09-30", {
              cashSources: [cash("c1", "銀行", 1000)],
              twStockValue: 5000,
            }),
          ]}
        />
      );

      expect(row("cash")).toHaveTextContent("現金合計$1,000$1,000持平");
      expect(row("tw-stock")).toHaveTextContent("台股市值$0$5,000▲ $5,000");
      expect(row("tw-stock")).not.toHaveTextContent("%");
    });

    // #55e
    it("新增與已移除的項目加上標示，缺少的一方顯示「—」", () => {
      render(
        <SnapshotComparison
          snapshots={[
            snap("2026-08-31", {
              cashSources: [cash("c1", "銀行", 1000)],
              debts: [debt("d1", "信貸", 30000)],
            }),
            snap("2026-09-30", {
              cashSources: [
                cash("c1", "銀行", 1000),
                cash("c2", "新帳戶", 700),
              ],
            }),
          ]}
        />
      );

      expect(row("cash-source-c2")).toHaveTextContent("新帳戶新增—$700▲ $700");
      expect(row("cash-source-c2")).not.toHaveTextContent("%");
      expect(row("debt-d1")).toHaveTextContent(
        "信貸（信貸）已移除$30,000—▼ $30,000 (-100.0%)"
      );
      expect(row("cash-source-c1")).not.toHaveTextContent("新增");
    });

    // #55l
    it("兩筆不動產皆為 0 時不列出；沒有現金來源或負債時顯示說明文字", () => {
      render(
        <SnapshotComparison
          snapshots={[
            snap("2026-08-31", { twStockValue: 1000 }),
            snap("2026-09-30", { twStockValue: 2000 }),
          ]}
        />
      );

      expect(
        screen.queryByTestId("comparison-row-real-estate")
      ).not.toBeInTheDocument();
      expect(screen.getByText("兩筆快照皆無現金來源")).toBeInTheDocument();
      expect(screen.getByText("兩筆快照皆無負債")).toBeInTheDocument();
    });

    it("有不動產市值時列出", () => {
      render(
        <SnapshotComparison
          snapshots={[
            snap("2026-08-31", { realEstateValue: 8000000 }),
            snap("2026-09-30", { realEstateValue: 8400000 }),
          ]}
        />
      );

      expect(row("real-estate")).toHaveTextContent(
        "不動產市值$8,000,000$8,400,000▲ $400,000 (+5.0%)"
      );
    });

    // PRD 5.10 節「顯示精度」
    it("增減以畫面上顯示的兩個數值相減，四捨五入後相同則顯示「持平」", () => {
      render(
        <SnapshotComparison
          snapshots={[
            snap("2026-08-31", {
              cashSources: [cash("c1", "甲", 100.4), cash("c2", "乙", 100.2)],
            }),
            snap("2026-09-30", {
              cashSources: [cash("c1", "甲", 100.6), cash("c2", "乙", 100.4)],
            }),
          ]}
        />
      );

      // $100 → $101：畫面上相差 1 元，而非實際的 0.2 元四捨五入成 $0
      expect(row("cash-source-c1")).toHaveTextContent("甲$100$101▲ $1");
      expect(row("cash-source-c2")).toHaveTextContent("乙$100$100持平");
    });
  });

  describe("切換日期", () => {
    // #55i
    it("切換「從」後表格即時更新", () => {
      render(<SnapshotComparison snapshots={[JULY, AUGUST, SEPTEMBER]} />);

      fireEvent.change(baseSelect(), { target: { value: "2026-07-31" } });

      expect(baseSelect().value).toBe("2026-07-31");
      expect(row("cash")).toHaveTextContent(
        "現金合計$80,000$150,000▲ $70,000 (+87.5%)"
      );
    });

    // #55i
    it("「從」晚於「到」時照常比較，增減為對象日 − 基準日", () => {
      render(<SnapshotComparison snapshots={[JULY, AUGUST, SEPTEMBER]} />);

      fireEvent.change(baseSelect(), { target: { value: "2026-09-30" } });
      fireEvent.change(targetSelect(), { target: { value: "2026-08-31" } });

      expect(row("cash")).toHaveTextContent(
        "現金合計$150,000$100,000▼ $50,000 (-33.3%)"
      );
    });

    // #55h
    it("選到同一天時不顯示表格，改顯示提示文字", () => {
      render(<SnapshotComparison snapshots={[JULY, AUGUST, SEPTEMBER]} />);

      fireEvent.change(baseSelect(), { target: { value: "2026-09-30" } });

      expect(
        screen.getByTestId("snapshot-comparison-same-date")
      ).toHaveTextContent("請選擇兩筆不同的快照");
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      // 下拉選單仍在，使用者可以改選
      expect(baseSelect()).toBeInTheDocument();
    });

    // #55j
    it("選取的快照被刪除後回到預設值", () => {
      const { rerender } = render(
        <SnapshotComparison snapshots={[JULY, AUGUST, SEPTEMBER]} />
      );
      fireEvent.change(baseSelect(), { target: { value: "2026-07-31" } });

      rerender(<SnapshotComparison snapshots={[AUGUST, SEPTEMBER]} />);

      expect(baseSelect().value).toBe("2026-08-31");
      expect(targetSelect().value).toBe("2026-09-30");
      expect(
        within(baseSelect())
          .getAllByRole("option")
          .map((option) => option.textContent)
      ).toEqual(["2026-09-30", "2026-08-31"]);
    });

    it("刪到剩 1 筆時回到提示文字", () => {
      const { rerender } = render(
        <SnapshotComparison snapshots={[AUGUST, SEPTEMBER]} />
      );

      rerender(<SnapshotComparison snapshots={[SEPTEMBER]} />);

      expect(
        screen.getByTestId("snapshot-comparison-empty")
      ).toBeInTheDocument();
    });
  });

  it("快照資料沒變時重新渲染不會重算比較結果", () => {
    const snapshots = [JULY, AUGUST, SEPTEMBER];
    const { rerender } = render(<SnapshotComparison snapshots={snapshots} />);
    expect(compareSnapshots).toHaveBeenCalledTimes(1);

    rerender(<SnapshotComparison snapshots={snapshots} />);
    rerender(<SnapshotComparison snapshots={snapshots} />);

    expect(compareSnapshots).toHaveBeenCalledTimes(1);
  });
});

// PRD 4.2「快照比較」、5.10 節「每月定期定額」、第 9 節 #62j～#62l
describe("SnapshotComparison：每月定期定額", () => {
  const AUGUST_WITH_INVESTMENTS = {
    ...AUGUST,
    recurringInvestments: [
      { id: "r1", name: "0050", amount: 10000 },
      { id: "r2", name: "VT", amount: 5000 },
    ],
  };
  const SEPTEMBER_WITH_INVESTMENTS = {
    ...SEPTEMBER,
    recurringInvestments: [
      { id: "r1", name: "0050", amount: 15000 },
      { id: "r3", name: "QQQ", amount: 3000 },
    ],
  };

  it("兩筆快照皆無定期定額時不顯示該組", () => {
    render(<SnapshotComparison snapshots={[AUGUST, SEPTEMBER]} />);

    expect(screen.queryByText("每月定期定額")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("comparison-row-recurring-investment-total")
    ).not.toBeInTheDocument();
  });

  it("依序列出合計、對象日的項目與已移除的項目", () => {
    render(
      <SnapshotComparison
        snapshots={[AUGUST_WITH_INVESTMENTS, SEPTEMBER_WITH_INVESTMENTS]}
      />
    );

    const group = screen.getByText("每月定期定額").closest("tbody")!;
    expect(
      within(group)
        .getAllByTestId(/^comparison-row-/)
        .map((element) => element.getAttribute("data-testid"))
    ).toEqual([
      "comparison-row-recurring-investment-total",
      "comparison-row-recurring-investment-r1",
      "comparison-row-recurring-investment-r3",
      "comparison-row-recurring-investment-r2",
    ]);
  });

  it("合計與既有項目顯示兩日金額與增減百分比", () => {
    render(
      <SnapshotComparison
        snapshots={[AUGUST_WITH_INVESTMENTS, SEPTEMBER_WITH_INVESTMENTS]}
      />
    );

    const total = row("recurring-investment-total");
    expect(total).toHaveTextContent("定期定額合計");
    expect(total).toHaveTextContent("$15,000");
    expect(total).toHaveTextContent("$18,000");
    expect(total).toHaveTextContent("▲ $3,000 (+20.0%)");
    expect(row("recurring-investment-r1")).toHaveTextContent(
      "▲ $5,000 (+50.0%)"
    );
  });

  it("新增的項目標示「新增」且不顯示百分比，消失的項目標示「已移除」", () => {
    render(
      <SnapshotComparison
        snapshots={[AUGUST_WITH_INVESTMENTS, SEPTEMBER_WITH_INVESTMENTS]}
      />
    );

    const added = row("recurring-investment-r3");
    expect(within(added).getByText("新增")).toBeInTheDocument();
    expect(added).toHaveTextContent("—");
    expect(added).toHaveTextContent("▲ $3,000");
    expect(added).not.toHaveTextContent("%");

    const removed = row("recurring-investment-r2");
    expect(within(removed).getByText("已移除")).toBeInTheDocument();
    expect(removed).toHaveTextContent("▼ $5,000");
  });

  it("只有對象日有定期定額時仍顯示該組，合計不顯示百分比", () => {
    render(
      <SnapshotComparison snapshots={[AUGUST, SEPTEMBER_WITH_INVESTMENTS]} />
    );

    const total = row("recurring-investment-total");
    expect(total).toHaveTextContent("$0");
    expect(total).toHaveTextContent("▲ $18,000");
    expect(total).not.toHaveTextContent("%");
  });

  it("金額沒變的項目顯示「持平」", () => {
    render(
      <SnapshotComparison
        snapshots={[
          AUGUST_WITH_INVESTMENTS,
          {
            ...SEPTEMBER,
            recurringInvestments: AUGUST_WITH_INVESTMENTS.recurringInvestments,
          },
        ]}
      />
    );

    expect(row("recurring-investment-total")).toHaveTextContent("持平");
    expect(row("recurring-investment-r1")).toHaveTextContent("持平");
  });
});

// PRD 4.2「快照比較」、5.10 節「質押」、第 9 節 #55m～#55p
describe("SnapshotComparison：質押", () => {
  function pledge(
    id: string,
    name: string,
    principal: number,
    collateralValue: number
  ): Debt {
    return {
      ...debt(id, name, principal),
      category: "質押",
      repaymentMethod: "interestOnly",
      collateralValue,
    };
  }

  const OCT_2 = snap("2026-10-02", {
    debts: [pledge("d1", "股票質押", 500000, 900000)],
  });
  const OCT_3 = snap("2026-10-03", {
    debts: [pledge("d1", "股票質押", 500000, 700000)],
  });

  function pledgeGroup() {
    return screen.getByRole("columnheader", { name: "質押" }).closest("tbody")!;
  }

  // #55p
  it("兩筆快照皆無質押負債時不顯示該組", () => {
    render(<SnapshotComparison snapshots={[AUGUST, SEPTEMBER]} />);

    expect(
      screen.queryByRole("columnheader", { name: "質押" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("comparison-row-pledge-maintenance-ratio")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("comparison-row-pledge-collateral-total")
    ).not.toBeInTheDocument();
  });

  // #55m
  it("本金不變時負債列持平，質押組仍列出維持率與質押股票市值的增減", () => {
    render(<SnapshotComparison snapshots={[OCT_2, OCT_3]} />);

    expect(row("debt-d1")).toHaveTextContent(
      "股票質押（質押）$500,000$500,000持平"
    );
    expect(row("pledge-maintenance-ratio")).toHaveTextContent(
      "質押整戶維持率180.0%140.0%▼ 40.0 個百分點"
    );
    expect(row("pledge-maintenance-ratio")).not.toHaveTextContent("(");
    expect(row("pledge-collateral-total")).toHaveTextContent(
      "質押股票市值合計$900,000$700,000▼ $200,000 (-22.2%)"
    );
    expect(row("pledge-collateral-d1")).toHaveTextContent(
      "股票質押$900,000$700,000▼ $200,000 (-22.2%)"
    );
  });

  it("質押組排在負債之後，依序為維持率、合計、逐筆", () => {
    render(
      <SnapshotComparison
        snapshots={[
          snap("2026-10-02", {
            debts: [
              pledge("d1", "券商質押", 300000, 500000),
              pledge("d2", "銀行質押", 200000, 300000),
            ],
          }),
          snap("2026-10-03", {
            debts: [
              pledge("d1", "券商質押", 300000, 450000),
              pledge("d2", "銀行質押", 200000, 300000),
            ],
          }),
        ]}
      />
    );

    expect(
      screen
        .getAllByRole("columnheader")
        .map((element) => element.textContent)
        .filter((title) => ["負債", "質押"].includes(title ?? ""))
    ).toEqual(["負債", "質押"]);
    expect(
      within(pledgeGroup())
        .getAllByTestId(/^comparison-row-/)
        .map((element) => element.getAttribute("data-testid"))
    ).toEqual([
      "comparison-row-pledge-maintenance-ratio",
      "comparison-row-pledge-collateral-total",
      "comparison-row-pledge-collateral-d1",
      "comparison-row-pledge-collateral-d2",
    ]);
    // #55n：整戶維持率以多筆合併計算
    expect(row("pledge-maintenance-ratio")).toHaveTextContent(
      "160.0%150.0%▼ 10.0 個百分點"
    );
    expect(row("pledge-collateral-total")).toHaveTextContent("▼ $50,000");
    expect(row("pledge-collateral-d2")).toHaveTextContent("持平");
  });

  // #55o
  it("基準日尚未填寫質押股票市值：維持率的基準日與增減顯示「—」，不加標示", () => {
    render(
      <SnapshotComparison
        snapshots={[
          snap("2026-10-02", { debts: [pledge("d1", "股票質押", 500000, 0)] }),
          snap("2026-10-03", {
            debts: [pledge("d1", "股票質押", 500000, 800000)],
          }),
        ]}
      />
    );

    const ratio = row("pledge-maintenance-ratio");
    expect(ratio).toHaveTextContent("質押整戶維持率—160.0%—");
    expect(ratio).not.toHaveTextContent("新增");
    expect(ratio).not.toHaveTextContent("個百分點");
    expect(ratio).not.toHaveTextContent("持平");
    expect(row("pledge-collateral-total")).toHaveTextContent(
      "質押股票市值合計$0$800,000▲ $800,000"
    );
    expect(row("pledge-collateral-total")).not.toHaveTextContent("%");
  });

  // #55o
  it("只有一方有質押負債時仍顯示該組，逐筆標示「新增」或「已移除」", () => {
    const withoutPledge = snap("2026-10-02", {
      debts: [debt("d0", "信貸", 200000)],
    });
    const withPledge = snap("2026-10-03", {
      debts: [pledge("d1", "股票質押", 500000, 800000)],
    });
    const { rerender } = render(
      <SnapshotComparison snapshots={[withoutPledge, withPledge]} />
    );

    expect(row("pledge-maintenance-ratio")).toHaveTextContent(
      "質押整戶維持率—160.0%—"
    );
    expect(
      within(row("pledge-maintenance-ratio")).queryByText("新增")
    ).not.toBeInTheDocument();
    expect(row("pledge-collateral-d1")).toHaveTextContent(
      "股票質押新增—$800,000▲ $800,000"
    );

    // 反向：對象日沒有質押負債
    rerender(
      <SnapshotComparison
        snapshots={[
          { ...withPledge, date: "2026-10-02" },
          { ...withoutPledge, date: "2026-10-03" },
        ]}
      />
    );

    expect(row("pledge-maintenance-ratio")).toHaveTextContent(
      "質押整戶維持率160.0%——"
    );
    expect(
      within(row("pledge-maintenance-ratio")).queryByText("已移除")
    ).not.toBeInTheDocument();
    expect(row("pledge-collateral-d1")).toHaveTextContent(
      "股票質押已移除$800,000—▼ $800,000 (-100.0%)"
    );
  });

  it("兩筆皆算不出維持率時三欄皆顯示「—」，不出現 NaN 或 Infinity", () => {
    render(
      <SnapshotComparison
        snapshots={[
          snap("2026-10-02", { debts: [pledge("d1", "股票質押", 0, 0)] }),
          snap("2026-10-03", { debts: [pledge("d1", "股票質押", 500000, 0)] }),
        ]}
      />
    );

    expect(row("pledge-maintenance-ratio")).toHaveTextContent(
      "質押整戶維持率———"
    );
    expect(pledgeGroup()).not.toHaveTextContent(/NaN|Infinity/);
  });

  it("維持率四捨五入後相同時顯示「持平」", () => {
    render(
      <SnapshotComparison
        snapshots={[
          snap("2026-10-02", {
            debts: [pledge("d1", "股票質押", 500000, 800000)],
          }),
          snap("2026-10-03", {
            debts: [pledge("d1", "股票質押", 500000, 800100)],
          }),
        ]}
      />
    );

    expect(row("pledge-maintenance-ratio")).toHaveTextContent(
      "160.0%160.0%持平"
    );
    expect(row("pledge-collateral-total")).toHaveTextContent("▲ $100");
  });
});
