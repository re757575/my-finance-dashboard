import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CashSourceList } from "@/components/CashSourceList";
import type { CashSource } from "@/types/schema";

describe("CashSourceList", () => {
  it("尚未新增現金來源時顯示提示文字", () => {
    render(<CashSourceList value={[]} onChange={vi.fn()} />);
    expect(screen.getByText("尚未新增現金來源")).toBeInTheDocument();
  });

  it("點擊新增按鈕會新增一筆空白現金來源", () => {
    const onChange = vi.fn();
    render(<CashSourceList value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByText("+ 新增現金來源"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CashSource[];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: "", amount: 0 });
    expect(next[0].id).toBeTruthy();
  });

  // PRD 第 9 節 #7：現金來源金額允許負數（透支帳戶）
  it("允許輸入負數金額", () => {
    const value: CashSource[] = [{ id: "1", name: "透支戶", amount: 0 }];
    const onChange = vi.fn();
    render(<CashSourceList value={value} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("金額"), {
      target: { value: "-2000" },
    });

    expect(onChange).toHaveBeenCalledWith([
      { id: "1", name: "透支戶", amount: -2000 },
    ]);
  });

  it("點擊刪除按鈕會移除該筆現金來源", () => {
    const value: CashSource[] = [
      { id: "1", name: "手邊現金", amount: 1000 },
      { id: "2", name: "中國信託", amount: 2000 },
    ];
    const onChange = vi.fn();
    render(<CashSourceList value={value} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("刪除 手邊現金"));

    expect(onChange).toHaveBeenCalledWith([
      { id: "2", name: "中國信託", amount: 2000 },
    ]);
  });

  it("顯示現金合計，套用千分位格式", () => {
    const value: CashSource[] = [
      { id: "1", name: "A", amount: 100000 },
      { id: "2", name: "B", amount: -20000 },
    ];
    render(<CashSourceList value={value} onChange={vi.fn()} />);
    expect(screen.getByText("現金合計：$80,000")).toBeInTheDocument();
  });
});
