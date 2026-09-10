import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IncomeSourceList } from "@/components/IncomeSourceList";
import type { IncomeSource } from "@/types/schema";

describe("IncomeSourceList", () => {
  it("尚未新增收入時顯示提示文字", () => {
    render(<IncomeSourceList value={[]} onChange={vi.fn()} />);
    expect(screen.getByText("尚未新增收入")).toBeInTheDocument();
  });

  it("點擊新增按鈕會新增一筆空白收入來源", () => {
    const onChange = vi.fn();
    render(<IncomeSourceList value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByText("+ 新增收入"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as IncomeSource[];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: "", amount: 0 });
    expect(next[0].id).toBeTruthy();
  });

  // PRD 4.2 節：收入金額僅允許 0 或正數，輸入負號會被 useNumberInputText 的 min=0 過濾掉
  it("輸入負數金額時負號被過濾，改存為正數", () => {
    const value: IncomeSource[] = [{ id: "1", name: "薪資", amount: 50000 }];
    const onChange = vi.fn();
    render(<IncomeSourceList value={value} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("收入金額"), {
      target: { value: "-1000" },
    });

    expect(onChange).toHaveBeenCalledWith([
      { id: "1", name: "薪資", amount: 1000 },
    ]);
  });

  it("點擊刪除按鈕會移除該筆收入", () => {
    const value: IncomeSource[] = [
      { id: "1", name: "薪資", amount: 50000 },
      { id: "2", name: "接案", amount: 20000 },
    ];
    const onChange = vi.fn();
    render(<IncomeSourceList value={value} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("刪除 薪資"));

    expect(onChange).toHaveBeenCalledWith([
      { id: "2", name: "接案", amount: 20000 },
    ]);
  });

  it("顯示收入合計，套用千分位格式", () => {
    const value: IncomeSource[] = [
      { id: "1", name: "薪資", amount: 50000 },
      { id: "2", name: "接案", amount: 20000 },
    ];
    render(<IncomeSourceList value={value} onChange={vi.fn()} />);
    expect(screen.getByText("收入合計：$70,000")).toBeInTheDocument();
  });
});
