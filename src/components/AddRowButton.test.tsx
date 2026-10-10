import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddRowButton } from "@/components/AddRowButton";

// PRD 第 7 節「觸控目標」

describe("AddRowButton", () => {
  it("顯示文字並在點擊時呼叫 onClick", () => {
    const onClick = vi.fn();
    render(<AddRowButton onClick={onClick}>+ 新增負債</AddRowButton>);

    const button = screen.getByRole("button", { name: "+ 新增負債" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("觸控裝置加高到 40px，滑鼠維持精簡尺寸", () => {
    render(<AddRowButton onClick={vi.fn()}>+ 新增收入</AddRowButton>);

    expect(screen.getByRole("button", { name: "+ 新增收入" })).toHaveClass(
      "h-7",
      "pointer-coarse:h-10"
    );
  });
});
