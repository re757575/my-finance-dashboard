import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedToggle } from "@/components/SegmentedToggle";

// PRD 第 7 節「觸控目標」

const OPTIONS = [
  { value: "USD", label: "USD" },
  { value: "TWD", label: "TWD" },
] as const;

describe("SegmentedToggle", () => {
  it("以具名的 group 呈現所有選項", () => {
    render(
      <SegmentedToggle
        label="美股市值計價幣別"
        options={OPTIONS}
        value="USD"
        onChange={vi.fn()}
      />
    );

    const group = screen.getByRole("group", { name: "美股市值計價幣別" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["USD", "TWD"]);
  });

  it("以 aria-pressed 標示目前選取的選項", () => {
    render(
      <SegmentedToggle
        label="幣別"
        options={OPTIONS}
        value="TWD"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "USD" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "TWD" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("點擊選項時以該選項的值呼叫 onChange", () => {
    const onChange = vi.fn();
    render(
      <SegmentedToggle
        label="幣別"
        options={OPTIONS}
        value="USD"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "TWD" }));

    expect(onChange).toHaveBeenCalledWith("TWD");
  });

  it("支援數字型別的值（壓力測試跌幅）", () => {
    const onChange = vi.fn();
    render(
      <SegmentedToggle
        label="股票下跌情境"
        options={[
          { value: 10, label: "−10%" },
          { value: 20, label: "−20%" },
        ]}
        value={10}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "−20%" }));

    expect(onChange).toHaveBeenCalledWith(20);
  });

  it("觸控裝置上每顆按鈕至少 40px 高，且文字不折行", () => {
    render(
      <SegmentedToggle
        label="攤還方式"
        options={[
          { value: "amortizing", label: "本息平均攤還" },
          { value: "interestOnly", label: "只計息" },
        ]}
        value="amortizing"
        onChange={vi.fn()}
        className="self-start"
      />
    );

    expect(screen.getByRole("group", { name: "攤還方式" })).toHaveClass(
      "whitespace-nowrap",
      "self-start"
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveClass("pointer-coarse:min-h-10");
    }
  });
});
