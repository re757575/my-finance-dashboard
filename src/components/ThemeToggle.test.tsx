import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/ThemeToggle";

// PRD 4.2「深色模式」
describe("ThemeToggle", () => {
  it("以「顯示主題」為無障礙標籤的原生下拉選單，選項依序為跟隨系統／淺色／深色", () => {
    render(<ThemeToggle value="system" onChange={vi.fn()} />);

    const select = screen.getByRole("combobox", { name: "顯示主題" });
    expect(select.tagName).toBe("SELECT");
    expect(
      screen.getAllByRole("option").map((option) => option.textContent)
    ).toEqual(["跟隨系統", "淺色", "深色"]);
    expect(
      screen
        .getAllByRole("option")
        .map((option) => (option as HTMLOptionElement).value)
    ).toEqual(["system", "light", "dark"]);
  });

  it.each([
    ["system", "跟隨系統"],
    ["light", "淺色"],
    ["dark", "深色"],
  ] as const)("value 為 %s 時選中「%s」", (value, label) => {
    render(<ThemeToggle value={value} onChange={vi.fn()} />);

    expect(screen.getByLabelText("顯示主題")).toHaveValue(value);
    expect(
      (screen.getByRole("option", { name: label }) as HTMLOptionElement)
        .selected
    ).toBe(true);
  });

  it("選擇其他選項時以對應的偏好值呼叫 onChange", () => {
    const onChange = vi.fn();
    render(<ThemeToggle value="system" onChange={onChange} />);
    const select = screen.getByLabelText("顯示主題");

    fireEvent.change(select, { target: { value: "dark" } });
    fireEvent.change(select, { target: { value: "light" } });
    fireEvent.change(select, { target: { value: "system" } });

    expect(onChange.mock.calls).toEqual([["dark"], ["light"], ["system"]]);
  });

  it("為受控元件：顯示的值只跟著 value 變動", () => {
    const { rerender } = render(
      <ThemeToggle value="light" onChange={vi.fn()} />
    );
    const select = screen.getByLabelText("顯示主題");

    fireEvent.change(select, { target: { value: "dark" } });
    expect(select).toHaveValue("light");

    rerender(<ThemeToggle value="dark" onChange={vi.fn()} />);
    expect(select).toHaveValue("dark");
  });

  it("同時帶有淺色與深色樣式", () => {
    render(<ThemeToggle value="system" onChange={vi.fn()} />);

    const select = screen.getByLabelText("顯示主題");
    expect(select).toHaveClass("bg-white", "border-slate-200");
    expect(select).toHaveClass("dark:bg-input/30", "dark:border-input");
  });
});
