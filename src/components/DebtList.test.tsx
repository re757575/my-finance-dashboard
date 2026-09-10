import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DebtList } from "@/components/DebtList";
import type { Debt } from "@/types/schema";

const debt: Debt = {
  id: "1",
  name: "房貸",
  category: "房貸",
  principal: 1000000,
  annualRate: 2.4,
  remainingMonths: 120,
  repaymentMethod: "amortizing",
};

describe("DebtList", () => {
  it("尚未新增負債時顯示提示文字", () => {
    render(<DebtList value={[]} onChange={vi.fn()} />);
    expect(screen.getByText("尚未新增負債")).toBeInTheDocument();
  });

  it("點擊新增按鈕會新增一筆信貸類別的空白負債，預設本息平均攤還", () => {
    const onChange = vi.fn();
    render(<DebtList value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByText("+ 新增負債"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as Debt[];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      name: "",
      category: "信貸",
      principal: 0,
      annualRate: 0,
      remainingMonths: 0,
      repaymentMethod: "amortizing",
    });
    expect(next[0].id).toBeTruthy();
  });

  // PRD 5.2 節：切換負債類別時，攤還方式一併切換為該類別的預設值（如質押預設只計息）
  it("切換負債類別為質押時，攤還方式自動切換為只計息", () => {
    const onChange = vi.fn();
    render(<DebtList value={[debt]} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("負債類別"), {
      target: { value: "質押" },
    });

    expect(onChange).toHaveBeenCalledWith([
      { ...debt, category: "質押", repaymentMethod: "interestOnly" },
    ]);
  });

  it("修改剩餘本金會透過 onChange 更新該筆負債", () => {
    const onChange = vi.fn();
    render(<DebtList value={[debt]} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("剩餘本金"), {
      target: { value: "900000" },
    });

    expect(onChange).toHaveBeenCalledWith([{ ...debt, principal: 900000 }]);
  });

  it("點擊刪除按鈕會移除該筆負債", () => {
    const onChange = vi.fn();
    render(<DebtList value={[debt]} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("刪除 房貸"));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("即時顯示該筆負債的每月應還款金額", () => {
    render(<DebtList value={[debt]} onChange={vi.fn()} />);

    // 本息平均攤還 PMT：本金 1,000,000、年利率 2.4%、120 期
    expect(screen.getByTestId("debt-monthly-payment")).toHaveTextContent(
      "$9,382"
    );
  });

  // PRD 4.2 節：只計息時每月應還 = 本金 × 年利率 ÷ 12，本金不隨時間攤還
  it("切換為只計息時，每月應還款金額改以「本金 × 年利率 ÷ 12」計算", () => {
    const interestOnlyDebt: Debt = { ...debt, repaymentMethod: "interestOnly" };
    render(<DebtList value={[interestOnlyDebt]} onChange={vi.fn()} />);

    expect(screen.getByTestId("debt-monthly-payment")).toHaveTextContent(
      "$2,000"
    );
  });

  // PRD 4.2 節：系統估算的欄位要顯示提示標記
  it("estimatedFields 標記剩餘本金為系統估算時顯示提示徽章", () => {
    render(
      <DebtList
        value={[debt]}
        onChange={vi.fn()}
        estimatedFields={{ [debt.id]: { principal: true } }}
      />
    );

    expect(screen.getByText("系統估算")).toBeInTheDocument();
  });

  it("點擊攤還方式切換按鈕會呼叫 onChange 更新該筆負債", () => {
    const onChange = vi.fn();
    render(<DebtList value={[debt]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "只計息" }));

    expect(onChange).toHaveBeenCalledWith([
      { ...debt, repaymentMethod: "interestOnly" },
    ]);
  });
});
