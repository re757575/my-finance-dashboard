import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecurringInvestmentList } from "@/components/RecurringInvestmentList";
import type { RecurringInvestment } from "@/types/schema";

describe("RecurringInvestmentList", () => {
  it("尚未新增定期定額時顯示提示文字，合計為 0", () => {
    render(<RecurringInvestmentList value={[]} onChange={vi.fn()} />);
    expect(screen.getByText("尚未新增定期定額")).toBeInTheDocument();
    expect(screen.getByText("定期定額合計：$0")).toBeInTheDocument();
  });

  // PRD 4.2 節：提醒使用者定期定額不算支出，避免與本月支出重複填寫
  it("顯示不算支出的說明", () => {
    render(<RecurringInvestmentList value={[]} onChange={vi.fn()} />);
    expect(
      screen.getByText("買股票不算支出，請勿重複填入本月支出")
    ).toBeInTheDocument();
  });

  it("點擊新增按鈕會新增一筆空白定期定額", () => {
    const onChange = vi.fn();
    render(<RecurringInvestmentList value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByText("+ 新增定期定額"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as RecurringInvestment[];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: "", amount: 0 });
    expect(next[0].id).toBeTruthy();
  });

  it("修改標的名稱只更新該筆", () => {
    const value: RecurringInvestment[] = [
      { id: "1", name: "0050", amount: 10000 },
      { id: "2", name: "", amount: 5000 },
    ];
    const onChange = vi.fn();
    render(<RecurringInvestmentList value={value} onChange={onChange} />);

    fireEvent.change(screen.getAllByLabelText("定期定額名稱")[1], {
      target: { value: "VT" },
    });

    expect(onChange).toHaveBeenCalledWith([
      { id: "1", name: "0050", amount: 10000 },
      { id: "2", name: "VT", amount: 5000 },
    ]);
  });

  // PRD 4.2 節：金額僅允許 0 或正數，輸入負號會被 useNumberInputText 的 min=0 過濾掉
  it("輸入負數金額時負號被過濾，改存為正數", () => {
    const value: RecurringInvestment[] = [
      { id: "1", name: "0050", amount: 10000 },
    ];
    const onChange = vi.fn();
    render(<RecurringInvestmentList value={value} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("定期定額金額"), {
      target: { value: "-3000" },
    });

    expect(onChange).toHaveBeenCalledWith([
      { id: "1", name: "0050", amount: 3000 },
    ]);
  });

  it("點擊刪除按鈕會移除該筆定期定額", () => {
    const value: RecurringInvestment[] = [
      { id: "1", name: "0050", amount: 10000 },
      { id: "2", name: "VT", amount: 5000 },
    ];
    const onChange = vi.fn();
    render(<RecurringInvestmentList value={value} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("刪除 0050"));

    expect(onChange).toHaveBeenCalledWith([
      { id: "2", name: "VT", amount: 5000 },
    ]);
  });

  it("名稱為空時刪除按鈕的無障礙標籤為「刪除 此筆定期定額」", () => {
    render(
      <RecurringInvestmentList
        value={[{ id: "1", name: "", amount: 0 }]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText("刪除 此筆定期定額")).toBeInTheDocument();
  });

  // PRD 第 9 節 #62a
  it("顯示定期定額合計，套用千分位格式", () => {
    const value: RecurringInvestment[] = [
      { id: "1", name: "0050", amount: 10000 },
      { id: "2", name: "VT", amount: 5000 },
    ];
    render(<RecurringInvestmentList value={value} onChange={vi.fn()} />);
    expect(screen.getByText("定期定額合計：$15,000")).toBeInTheDocument();
  });
});
