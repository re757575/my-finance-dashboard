import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectionToggleHeading } from "@/components/SectionToggleHeading";

// PRD 4.2「快照比較與歷史快照預設收合」第 2 點

describe("SectionToggleHeading", () => {
  it("以二級標題呈現，標題本身是切換按鈕", () => {
    render(
      <SectionToggleHeading
        title="歷史快照"
        open={false}
        onToggle={vi.fn()}
        contentId="content"
      />
    );

    const heading = screen.getByRole("heading", { level: 2, name: "歷史快照" });
    expect(heading).toContainElement(
      screen.getByRole("button", { name: "歷史快照" })
    );
  });

  it("以 aria-expanded 與 aria-controls 表達狀態與對應的內容", () => {
    const { rerender } = render(
      <SectionToggleHeading
        title="歷史快照"
        open={false}
        onToggle={vi.fn()}
        contentId="content"
      />
    );
    const button = screen.getByRole("button", { name: "歷史快照" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "content");

    rerender(
      <SectionToggleHeading
        title="歷史快照"
        open
        onToggle={vi.fn()}
        contentId="content"
      />
    );
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("點擊呼叫 onToggle", () => {
    const onToggle = vi.fn();
    render(
      <SectionToggleHeading
        title="快照比較"
        open={false}
        onToggle={onToggle}
        contentId="content"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "快照比較" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("箭頭只是裝飾，不出現在按鈕的名稱裡；展開時旋轉朝下", () => {
    const { container, rerender } = render(
      <SectionToggleHeading
        title="快照比較"
        open={false}
        onToggle={vi.fn()}
        contentId="content"
      />
    );
    const icon = container.querySelector("svg")!;
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).not.toHaveClass("rotate-90");

    rerender(
      <SectionToggleHeading
        title="快照比較"
        open
        onToggle={vi.fn()}
        contentId="content"
      />
    );
    expect(icon).toHaveClass("rotate-90");
  });
});

// PRD 第 7 節「輸入區分段收合」：輸入區內的分段標題字級較小
describe("SectionToggleHeading：字級", () => {
  it('預設為頁面層級的 text-lg，size="sm" 時改為 text-sm', () => {
    const { rerender } = render(
      <SectionToggleHeading
        title="負債"
        open={false}
        onToggle={vi.fn()}
        contentId="content"
      />
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveClass("text-lg");

    rerender(
      <SectionToggleHeading
        title="負債"
        open={false}
        onToggle={vi.fn()}
        contentId="content"
        size="sm"
      />
    );
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveClass("text-sm");
    expect(heading).not.toHaveClass("text-lg");
  });
});
