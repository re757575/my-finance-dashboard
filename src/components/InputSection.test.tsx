import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InputSection } from "@/components/InputSection";

// PRD 4.2「輸入區分段收合」第 2、4 點

function renderSection(open: boolean, onToggle = vi.fn()) {
  render(
    <InputSection
      title="負債"
      testId="input-section-debts"
      open={open}
      onToggle={onToggle}
      summary="2 筆・$5,000,000"
    >
      <label>
        剩餘本金
        <input />
      </label>
    </InputSection>
  );
  return onToggle;
}

const toggle = () => screen.getByRole("button", { name: "負債" });

describe("InputSection", () => {
  it("展開時顯示欄位，不顯示摘要", () => {
    renderSection(true);

    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("剩餘本金")).toBeVisible();
    expect(
      screen.queryByTestId("input-section-debts-summary")
    ).not.toBeInTheDocument();
  });

  it("收合時不渲染欄位，改在標題旁顯示摘要", () => {
    renderSection(false);

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("剩餘本金")).not.toBeInTheDocument();
    expect(screen.getByTestId("input-section-debts-summary")).toHaveTextContent(
      "2 筆・$5,000,000"
    );
  });

  it("標題按鈕的名稱不含摘要，並以 aria-controls 對應內容容器", () => {
    renderSection(false);

    const controls = toggle().getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).toHaveAttribute("hidden");
  });

  it("點擊標題呼叫 onToggle", () => {
    const onToggle = renderSection(false);

    fireEvent.click(toggle());

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
