import { useState } from "react";
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

  // PRD 第 9 節 #7a：複製現金來源
  describe("複製現金來源", () => {
    it("在原列正下方插入同名、金額歸零、新 id 的來源，其餘列順序不變", () => {
      const value: CashSource[] = [
        { id: "1", name: "富邦", amount: 100000 },
        { id: "2", name: "國泰", amount: 2000 },
      ];
      const onChange = vi.fn();
      render(<CashSourceList value={value} onChange={onChange} />);

      fireEvent.click(screen.getByLabelText("複製 富邦"));

      const next = onChange.mock.calls[0][0] as CashSource[];
      expect(next).toHaveLength(3);
      expect(next[0]).toEqual(value[0]);
      expect(next[1]).toMatchObject({ name: "富邦", amount: 0 });
      expect(next[1].id).toBeTruthy();
      expect(next[1].id).not.toBe("1");
      expect(next[2]).toEqual(value[1]);
    });

    it("名稱為空時，複製按鈕以「此筆現金來源」作為無障礙標籤", () => {
      const value: CashSource[] = [{ id: "1", name: "", amount: 0 }];
      render(<CashSourceList value={value} onChange={vi.fn()} />);

      expect(screen.getByLabelText("複製 此筆現金來源")).toBeInTheDocument();
    });

    it("複製後焦點移到新列的金額欄，現金合計不變", () => {
      function Harness() {
        const [value, setValue] = useState<CashSource[]>([
          { id: "1", name: "富邦", amount: 100000 },
        ]);
        return <CashSourceList value={value} onChange={setValue} />;
      }
      render(<Harness />);

      fireEvent.click(screen.getByLabelText("複製 富邦"));

      const amountInputs = screen.getAllByLabelText("金額");
      expect(amountInputs).toHaveLength(2);
      expect(amountInputs[1]).toHaveFocus();
      expect(screen.getByText("現金合計：$100,000")).toBeInTheDocument();
    });
  });
});
