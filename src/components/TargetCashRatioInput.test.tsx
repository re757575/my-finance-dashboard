import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TargetCashRatioInput } from "@/components/TargetCashRatioInput";

describe("TargetCashRatioInput", () => {
  it("顯示目前的目標現金比例數值", () => {
    render(<TargetCashRatioInput value={20} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/^目標現金比例/)).toHaveValue("20");
  });

  it("輸入變更時呼叫 onChange", () => {
    const onChange = vi.fn();
    render(<TargetCashRatioInput value={0} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/^目標現金比例/), {
      target: { value: "30" },
    });

    expect(onChange).toHaveBeenCalledWith(30);
  });

  it("不允許輸入負數", () => {
    const onChange = vi.fn();
    render(<TargetCashRatioInput value={0} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/^目標現金比例/), {
      target: { value: "-10" },
    });

    expect(onChange).toHaveBeenCalledWith(10);
  });
});
