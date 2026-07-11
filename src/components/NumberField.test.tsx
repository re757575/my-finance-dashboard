import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumberField } from "@/components/NumberField";

describe("NumberField", () => {
  // PRD 第 9 節 #8：貸款等欄位不得為負數
  it("設定 min={0} 時會將負數輸入夾到 0", () => {
    const onChange = vi.fn();
    render(
      <NumberField label="銀行貸款餘額" value={0} min={0} onChange={onChange} />
    );

    fireEvent.change(screen.getByLabelText("銀行貸款餘額"), {
      target: { value: "-500" },
    });

    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("未設定 min 時允許負數（現金來源情境）", () => {
    const onChange = vi.fn();
    render(<NumberField label="本月現金流" value={0} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("本月現金流"), {
      target: { value: "-500" },
    });

    expect(onChange).toHaveBeenCalledWith(-500);
  });

  // PRD 第 9 節 #9：非數字輸入視為 0
  it("非數字輸入視為 0", () => {
    const onChange = vi.fn();
    render(
      <NumberField label="美股匯率" value={0} min={0} onChange={onChange} />
    );

    fireEvent.change(screen.getByLabelText("美股匯率"), {
      target: { value: "abc" },
    });

    expect(onChange).toHaveBeenCalledWith(0);
  });
});
