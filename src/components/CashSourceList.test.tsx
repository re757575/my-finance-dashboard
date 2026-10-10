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
    expect(next[0]).toMatchObject({ name: "", amount: 0, restricted: false });
    expect(next[0].id).toBeTruthy();
  });

  // PRD 第 9 節 #7：現金來源金額允許負數（透支帳戶）
  it("允許輸入負數金額", () => {
    const value: CashSource[] = [
      { id: "1", name: "透支戶", amount: 0, restricted: false },
    ];
    const onChange = vi.fn();
    render(<CashSourceList value={value} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("金額"), {
      target: { value: "-2000" },
    });

    expect(onChange).toHaveBeenCalledWith([
      { id: "1", name: "透支戶", amount: -2000, restricted: false },
    ]);
  });

  it("點擊刪除按鈕會移除該筆現金來源", () => {
    const value: CashSource[] = [
      { id: "1", name: "手邊現金", amount: 1000, restricted: false },
      { id: "2", name: "中國信託", amount: 2000, restricted: false },
    ];
    const onChange = vi.fn();
    render(<CashSourceList value={value} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("刪除 手邊現金"));

    expect(onChange).toHaveBeenCalledWith([
      { id: "2", name: "中國信託", amount: 2000, restricted: false },
    ]);
  });

  it("顯示現金合計，套用千分位格式", () => {
    const value: CashSource[] = [
      { id: "1", name: "A", amount: 100000, restricted: false },
      { id: "2", name: "B", amount: -20000, restricted: false },
    ];
    render(<CashSourceList value={value} onChange={vi.fn()} />);
    expect(screen.getByText("現金合計：$80,000")).toBeInTheDocument();
  });

  // PRD 第 9 節 #7a：複製現金來源
  describe("複製現金來源", () => {
    it("在原列正下方插入同名、金額歸零、新 id 的來源，其餘列順序不變", () => {
      const value: CashSource[] = [
        { id: "1", name: "富邦", amount: 100000, restricted: false },
        { id: "2", name: "國泰", amount: 2000, restricted: false },
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
      const value: CashSource[] = [
        { id: "1", name: "", amount: 0, restricted: false },
      ];
      render(<CashSourceList value={value} onChange={vi.fn()} />);

      expect(screen.getByLabelText("複製 此筆現金來源")).toBeInTheDocument();
    });

    it("複製後焦點移到新列的金額欄，現金合計不變", () => {
      function Harness() {
        const [value, setValue] = useState<CashSource[]>([
          { id: "1", name: "富邦", amount: 100000, restricted: false },
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

  // PRD 4.2「多來源現金清單」：不可動用切換
  describe("不可動用標記", () => {
    // PRD 第 7 節「操作圖示」、第 9 節 #67g、#67h：狀態不只靠顏色，也不使用 emoji
    it("未標記顯示開鎖圖示、已標記顯示閉鎖圖示", () => {
      const value: CashSource[] = [
        { id: "1", name: "薪轉戶", amount: 50000, restricted: false },
        { id: "2", name: "期貨保證金", amount: 100000, restricted: true },
      ];
      render(<CashSourceList value={value} onChange={vi.fn()} />);

      const unlocked = screen.getByLabelText("標記 薪轉戶 為不可動用");
      const locked = screen.getByLabelText("標記 期貨保證金 為不可動用");
      expect(unlocked.querySelector("svg")).toHaveClass("lucide-lock-open");
      expect(locked.querySelector("svg")).toHaveClass("lucide-lock");
      expect(locked.querySelector("svg")).not.toHaveClass("lucide-lock-open");
      expect(locked).toHaveClass("bg-amber-50");
      expect(unlocked).not.toHaveClass("bg-amber-50");
    });

    it("鎖定、複製、刪除按鈕都是 SVG 圖示，不含 emoji 文字", () => {
      const value: CashSource[] = [
        { id: "1", name: "薪轉戶", amount: 50000, restricted: false },
      ];
      render(<CashSourceList value={value} onChange={vi.fn()} />);

      for (const label of [
        "標記 薪轉戶 為不可動用",
        "複製 薪轉戶",
        "刪除 薪轉戶",
      ]) {
        const button = screen.getByLabelText(label);
        expect(button).toHaveTextContent("");
        expect(button.querySelector("svg")).toHaveAttribute(
          "aria-hidden",
          "true"
        );
      }
    });

    it("點擊鎖定鈕會切換該筆來源的不可動用狀態，且 aria-pressed 反映目前狀態", () => {
      const value: CashSource[] = [
        { id: "1", name: "期貨保證金", amount: 100000, restricted: false },
      ];
      const onChange = vi.fn();
      render(<CashSourceList value={value} onChange={onChange} />);

      const toggle = screen.getByLabelText("標記 期貨保證金 為不可動用");
      expect(toggle).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(toggle);

      expect(onChange).toHaveBeenCalledWith([
        { id: "1", name: "期貨保證金", amount: 100000, restricted: true },
      ]);
    });

    it("已標記為不可動用的來源，aria-pressed 為 true，再點一次會改回可動用", () => {
      const value: CashSource[] = [
        { id: "1", name: "期貨保證金", amount: 100000, restricted: true },
      ];
      const onChange = vi.fn();
      render(<CashSourceList value={value} onChange={onChange} />);

      const toggle = screen.getByLabelText("標記 期貨保證金 為不可動用");
      expect(toggle).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(toggle);

      expect(onChange.mock.calls[0][0][0].restricted).toBe(false);
    });

    it("名稱為空時，切換鈕以「此筆現金來源」作為無障礙標籤", () => {
      const value: CashSource[] = [
        { id: "1", name: "", amount: 0, restricted: false },
      ];
      render(<CashSourceList value={value} onChange={vi.fn()} />);

      expect(
        screen.getByLabelText("標記 此筆現金來源 為不可動用")
      ).toBeInTheDocument();
    });

    it("存在不可動用來源時，現金合計後方補充顯示不可動用金額；沒有時不顯示", () => {
      const { rerender } = render(
        <CashSourceList
          value={[
            { id: "1", name: "A", amount: 200000, restricted: false },
            { id: "2", name: "B", amount: 100000, restricted: true },
          ]}
          onChange={vi.fn()}
        />
      );
      expect(screen.getByText(/現金合計：\$300,000/)).toBeInTheDocument();
      expect(screen.getByTestId("restricted-cash-total")).toHaveTextContent(
        "（其中不可動用 $100,000）"
      );

      rerender(
        <CashSourceList
          value={[{ id: "1", name: "A", amount: 200000, restricted: false }]}
          onChange={vi.fn()}
        />
      );
      expect(
        screen.queryByTestId("restricted-cash-total")
      ).not.toBeInTheDocument();
    });

    // PRD 第 9 節 #40b：複製時沿用「不可動用」狀態
    it("複製不可動用的來源時，新來源沿用不可動用狀態", () => {
      const value: CashSource[] = [
        { id: "1", name: "期貨保證金", amount: 100000, restricted: true },
      ];
      const onChange = vi.fn();
      render(<CashSourceList value={value} onChange={onChange} />);

      fireEvent.click(screen.getByLabelText("複製 期貨保證金"));

      const next = onChange.mock.calls[0][0] as CashSource[];
      expect(next[1]).toMatchObject({
        name: "期貨保證金",
        amount: 0,
        restricted: true,
      });
    });
  });
});
