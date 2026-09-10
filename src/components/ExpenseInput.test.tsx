import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpenseInput } from "@/components/ExpenseInput";

describe("ExpenseInput", () => {
  it("顯示欄位標籤與目前的支出金額", () => {
    render(<ExpenseInput value={30000} onChange={vi.fn()} />);

    expect(screen.getByLabelText("本月支出（不含負債月付）")).toHaveValue(
      "30000"
    );
  });

  it("輸入金額變動時呼叫 onChange", () => {
    const onChange = vi.fn();
    render(<ExpenseInput value={0} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("本月支出（不含負債月付）"), {
      target: { value: "45000" },
    });

    expect(onChange).toHaveBeenCalledWith(45000);
  });

  // PRD 4.2 節：本月支出僅允許 0 或正數，輸入負號會被過濾掉
  it("輸入負數金額時負號被過濾，改存為正數", () => {
    const onChange = vi.fn();
    render(<ExpenseInput value={0} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("本月支出（不含負債月付）"), {
      target: { value: "-500" },
    });

    expect(onChange).toHaveBeenCalledWith(500);
  });
});
