import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  formatGroupedNumberText,
  useNumberInputText,
} from "@/hooks/useNumberInputText";

// PRD 4.2「金額千分位顯示」、第 9 節 #65a～#65c

function Field({
  initial,
  min,
  max,
  onChange,
}: {
  initial: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
}) {
  const [value, setValue] = useState(initial);
  const { text, handleChange, handleFocus, handleBlur } = useNumberInputText({
    value,
    onChange: (next) => {
      setValue(next);
      onChange?.(next);
    },
    min,
    max,
  });
  return (
    <>
      <input
        aria-label="金額"
        value={text}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      <button type="button" onClick={() => setValue(9876543)}>
        由外部改值
      </button>
    </>
  );
}

const input = () => screen.getByLabelText<HTMLInputElement>("金額");

describe("formatGroupedNumberText", () => {
  it("整數部分每三位加上逗號", () => {
    expect(formatGroupedNumberText(5487138)).toBe("5,487,138");
    expect(formatGroupedNumberText(1000)).toBe("1,000");
    expect(formatGroupedNumberText(123456789)).toBe("123,456,789");
  });

  it("未滿四位數不加逗號", () => {
    expect(formatGroupedNumberText(999)).toBe("999");
    expect(formatGroupedNumberText(31.18)).toBe("31.18");
    expect(formatGroupedNumberText(2.2)).toBe("2.2");
  });

  it("小數部分原樣保留，不分組也不補零", () => {
    expect(formatGroupedNumberText(18867.36)).toBe("18,867.36");
    expect(formatGroupedNumberText(1234567.125)).toBe("1,234,567.125");
  });

  it("負數的負號不影響分組", () => {
    expect(formatGroupedNumberText(-1234567)).toBe("-1,234,567");
    expect(formatGroupedNumberText(-999)).toBe("-999");
  });

  it("0 顯示為空字串", () => {
    expect(formatGroupedNumberText(0)).toBe("");
  });

  it("科學記號（極大值）原樣顯示，不嘗試分組", () => {
    expect(formatGroupedNumberText(1e21)).toBe("1e+21");
  });
});

describe("useNumberInputText", () => {
  it("未聚焦時以千分位顯示", () => {
    render(<Field initial={5487138} />);
    expect(input()).toHaveValue("5,487,138");
  });

  it("數值為 0 時顯示空白", () => {
    render(<Field initial={0} />);
    expect(input()).toHaveValue("");
  });

  it("聚焦時還原為純數字並全選", () => {
    render(<Field initial={5487138} />);

    fireEvent.focus(input());

    expect(input()).toHaveValue("5487138");
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe("5487138".length);
  });

  it("未滿四位數（文字不變）聚焦時同樣全選", () => {
    render(<Field initial={241} />);

    fireEvent.focus(input());

    expect(input()).toHaveValue("241");
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe(3);
  });

  it("編輯過程不出現逗號，離開欄位後才恢復千分位", () => {
    const onChange = vi.fn();
    render(<Field initial={0} onChange={onChange} />);

    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "12800000" } });
    expect(input()).toHaveValue("12800000");
    expect(onChange).toHaveBeenLastCalledWith(12800000);

    fireEvent.blur(input());
    expect(input()).toHaveValue("12,800,000");
  });

  it("貼上含逗號的數字時逗號被去除，數值正確", () => {
    const onChange = vi.fn();
    render(<Field initial={0} onChange={onChange} />);

    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "1,234,567" } });

    expect(input()).toHaveValue("1234567");
    expect(onChange).toHaveBeenLastCalledWith(1234567);
  });

  it("小數金額離開欄位後保留小數", () => {
    render(<Field initial={0} />);

    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "18867.36" } });
    fireEvent.blur(input());

    expect(input()).toHaveValue("18,867.36");
  });

  it("允許負數的欄位：負數同樣以千分位顯示", () => {
    render(<Field initial={-1234567} />);
    expect(input()).toHaveValue("-1,234,567");
  });

  it("min 為 0 的欄位擋掉負號", () => {
    const onChange = vi.fn();
    render(<Field initial={0} min={0} onChange={onChange} />);

    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "-5000" } });

    expect(input()).toHaveValue("5000");
    expect(onChange).toHaveBeenLastCalledWith(5000);
  });

  it("未聚焦時由外部改值（如載入其他快照）會以千分位更新", () => {
    render(<Field initial={1000} />);

    fireEvent.click(screen.getByRole("button", { name: "由外部改值" }));

    expect(input()).toHaveValue("9,876,543");
  });

  it("聚焦中由外部改值不會打斷正在輸入的文字", () => {
    render(<Field initial={1000} />);

    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "由外部改值" }));

    expect(input()).toHaveValue("12");
  });
});

// PRD 4.2「壓力測試卡」第 9 點：自訂跌幅上限 100
describe("useNumberInputText：上限", () => {
  it("輸入超過 max 時，文字與數值都改為上限", () => {
    const onChange = vi.fn();
    render(<Field initial={20} min={0} max={100} onChange={onChange} />);

    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "150" } });

    expect(input()).toHaveValue("100");
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it("未超過 max 時照常輸入，含小數與剛好等於上限", () => {
    const onChange = vi.fn();
    render(<Field initial={20} min={0} max={100} onChange={onChange} />);

    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "45.5" } });
    expect(input()).toHaveValue("45.5");
    expect(onChange).toHaveBeenLastCalledWith(45.5);

    fireEvent.change(input(), { target: { value: "100" } });
    expect(input()).toHaveValue("100");
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it("沒有設定 max 的欄位不受限制", () => {
    const onChange = vi.fn();
    render(<Field initial={20} min={0} onChange={onChange} />);

    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "150" } });

    expect(input()).toHaveValue("150");
    expect(onChange).toHaveBeenLastCalledWith(150);
  });
});
