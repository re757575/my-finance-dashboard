import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DemoDataBanner } from "@/components/DemoDataBanner";

function openConfirm() {
  fireEvent.click(
    screen.getByRole("button", { name: "清除範例資料，開始使用" })
  );
}

// PRD 4.2「範例資料」、第 9 節 #63b、#63f、#63g
describe("DemoDataBanner", () => {
  // 第 7 節無障礙：以文字說明狀態，不只用顏色區分
  it("以文字說明目前顯示的是範例資料，且數字皆為虛構", () => {
    render(<DemoDataBanner onExit={vi.fn()} />);

    const banner = screen.getByTestId("demo-data-banner");
    expect(banner).toHaveTextContent("目前顯示的是範例資料");
    expect(banner).toHaveTextContent("所有數字皆為虛構");
    expect(banner).toHaveTextContent("就能開始輸入自己的資料");
  });

  it("以 status 角色呈現，方便輔助科技朗讀", () => {
    render(<DemoDataBanner onExit={vi.fn()} />);

    expect(screen.getByRole("status")).toBe(
      screen.getByTestId("demo-data-banner")
    );
  });

  it("尚未點擊時不顯示確認對話框", () => {
    render(<DemoDataBanner onExit={vi.fn()} />);

    expect(screen.queryByText("確認清除範例資料？")).not.toBeInTheDocument();
  });

  it("點擊「清除範例資料，開始使用」先開啟二次確認，不會直接清除", () => {
    const onExit = vi.fn();
    render(<DemoDataBanner onExit={onExit} />);

    openConfirm();

    expect(screen.getByText("確認清除範例資料？")).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });

  it("確認對話框說明會一併清除修改、無法復原、之後可重新載入", () => {
    render(<DemoDataBanner onExit={vi.fn()} />);

    openConfirm();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("包含你在範例資料上所做的修改");
    expect(dialog).toHaveTextContent("此操作無法復原");
    expect(dialog).toHaveTextContent("之後仍可重新載入範例資料");
  });

  it("按「取消」關閉對話框，不呼叫 onExit", () => {
    const onExit = vi.fn();
    render(<DemoDataBanner onExit={onExit} />);

    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByText("確認清除範例資料？")).not.toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });

  it("按「確認清除」呼叫 onExit 一次並關閉對話框", () => {
    const onExit = vi.fn();
    render(<DemoDataBanner onExit={onExit} />);

    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "確認清除" }));

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("確認清除範例資料？")).not.toBeInTheDocument();
  });
});
