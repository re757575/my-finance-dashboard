import { fireEvent, render, screen } from "@testing-library/react";
import { Trash2 } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { RowIconButton } from "@/components/RowIconButton";

// PRD 第 7 節「觸控目標」「操作圖示」

describe("RowIconButton", () => {
  it("只有圖示沒有文字，名稱由 label 提供", () => {
    render(
      <RowIconButton label="刪除 範例銀行">
        <Trash2 aria-hidden="true" />
      </RowIconButton>
    );

    const button = screen.getByRole("button", { name: "刪除 範例銀行" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveTextContent("");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("點擊呼叫 onClick", () => {
    const onClick = vi.fn();
    render(
      <RowIconButton label="複製" onClick={onClick}>
        <Trash2 aria-hidden="true" />
      </RowIconButton>
    );

    fireEvent.click(screen.getByRole("button", { name: "複製" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("滑鼠為 32px、觸控裝置放大到 40px 見方", () => {
    render(
      <RowIconButton label="複製">
        <Trash2 aria-hidden="true" />
      </RowIconButton>
    );

    const button = screen.getByRole("button", { name: "複製" });
    expect(button).toHaveClass("size-8", "pointer-coarse:size-10");
  });

  it("danger 用紅色的 hover 樣式，neutral 不用", () => {
    render(
      <>
        <RowIconButton label="刪除" tone="danger">
          <Trash2 aria-hidden="true" />
        </RowIconButton>
        <RowIconButton label="複製">
          <Trash2 aria-hidden="true" />
        </RowIconButton>
      </>
    );

    expect(screen.getByRole("button", { name: "刪除" })).toHaveClass(
      "hover:text-rose-500"
    );
    expect(screen.getByRole("button", { name: "複製" })).not.toHaveClass(
      "hover:text-rose-500"
    );
  });

  it("可傳入 aria-pressed、title 與額外的 className（後者覆蓋預設文字顏色）", () => {
    render(
      <RowIconButton
        label="標記為不可動用"
        aria-pressed
        title="不可動用"
        className="text-amber-600"
      >
        <Trash2 aria-hidden="true" />
      </RowIconButton>
    );

    const button = screen.getByRole("button", { name: "標記為不可動用" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("title", "不可動用");
    expect(button).toHaveClass("text-amber-600");
    expect(button).not.toHaveClass("text-slate-500");
  });
});
