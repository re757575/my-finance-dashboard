import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SnapshotEditBanner } from "@/components/SnapshotEditBanner";

describe("SnapshotEditBanner", () => {
  it("date 為 null（一般狀態）時不渲染任何內容", () => {
    const { container } = render(
      <SnapshotEditBanner date={null} onCancel={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  // PRD 第 9 節 #48b、第 7 節無障礙：以文字說明狀態
  it("顯示「正在修正 {日期} 的快照」，並說明日期不可更改與今日草稿已暫存", () => {
    render(<SnapshotEditBanner date="2026-09-20" onCancel={vi.fn()} />);

    const banner = screen.getByTestId("snapshot-edit-banner");
    expect(banner).toHaveTextContent("正在修正 2026-09-20 的快照");
    expect(banner).toHaveTextContent("日期無法更改");
    expect(banner).toHaveTextContent("今日草稿已暫存，完成後會還原");
  });

  it("以 status 角色呈現，方便輔助科技朗讀", () => {
    render(<SnapshotEditBanner date="2026-09-20" onCancel={vi.fn()} />);
    expect(screen.getByRole("status")).toBe(
      screen.getByTestId("snapshot-edit-banner")
    );
  });

  it("點擊「取消修正」呼叫 onCancel", () => {
    const onCancel = vi.fn();
    render(<SnapshotEditBanner date="2026-09-20" onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "取消修正" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
