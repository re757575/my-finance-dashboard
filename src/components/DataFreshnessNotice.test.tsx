import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataFreshnessNotice } from "@/components/DataFreshnessNotice";
import type { DataFreshness } from "@/lib/dataFreshness";

function freshness(overrides: Partial<DataFreshness> = {}): DataFreshness {
  return {
    days: 5,
    lastDate: "2026-09-25",
    status: "fresh",
    ...overrides,
  };
}

describe("DataFreshnessNotice", () => {
  // PRD 第 9 節 #47d
  it("freshness 為 null（沒有任何快照）時不渲染任何內容", () => {
    const { container } = render(<DataFreshnessNotice freshness={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  // PRD 第 9 節 #47
  it("今天已存檔：顯示「今日已更新」，沒有過期標籤", () => {
    render(
      <DataFreshnessNotice
        freshness={freshness({
          days: 0,
          lastDate: "2026-09-30",
          status: "today",
        })}
      />
    );

    expect(screen.getByTestId("data-freshness")).toHaveTextContent(
      "今日已更新"
    );
    expect(
      screen.queryByTestId("data-freshness-stale-badge")
    ).not.toBeInTheDocument();
  });

  // PRD 第 9 節 #47a
  it("數天前：顯示「距上次更新 N 天（日期）」，沒有過期標籤", () => {
    render(<DataFreshnessNotice freshness={freshness()} />);

    expect(screen.getByTestId("data-freshness")).toHaveTextContent(
      "距上次更新 5 天（2026-09-25）"
    );
    expect(
      screen.queryByTestId("data-freshness-stale-badge")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("data-freshness")).not.toHaveClass(
      "text-amber-700"
    );
  });

  // PRD 第 9 節 #47b、第 7 節無障礙：文字與顏色同時呈現
  it("超過門檻：以琥珀色顯示，並加上文字標籤「資料可能已過期」與更新提示", () => {
    render(
      <DataFreshnessNotice
        freshness={freshness({
          days: 20,
          lastDate: "2026-09-10",
          status: "stale",
        })}
      />
    );

    expect(screen.getByTestId("data-freshness")).toHaveTextContent(
      "距上次更新 20 天（2026-09-10）"
    );
    expect(screen.getByTestId("data-freshness")).toHaveClass("text-amber-700");
    expect(screen.getByTestId("data-freshness-stale-badge")).toHaveTextContent(
      "資料可能已過期"
    );
    expect(
      screen.getByText("請更新股票市值、現金與負債後再存檔")
    ).toBeInTheDocument();
  });
});
