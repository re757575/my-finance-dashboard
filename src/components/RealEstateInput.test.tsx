import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RealEstateInput } from "@/components/RealEstateInput";

describe("RealEstateInput", () => {
  it("顯示目前的不動產市值", () => {
    render(<RealEstateInput value={10000000} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/不動產市值/)).toHaveValue("10000000");
  });

  it("輸入數字會透過 onChange 回報", () => {
    const onChange = vi.fn();
    render(<RealEstateInput value={0} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/不動產市值/), {
      target: { value: "8000000" },
    });

    expect(onChange).toHaveBeenCalledWith(8000000);
  });

  // PRD 4.2「不動產市值」：僅允許 0 或正數
  it("負號會被即時濾掉，不接受負數", () => {
    const onChange = vi.fn();
    render(<RealEstateInput value={0} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/不動產市值/), {
      target: { value: "-500" },
    });

    expect(onChange).toHaveBeenCalledWith(500);
  });
});
