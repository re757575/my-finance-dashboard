import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumberField } from "@/components/NumberField";

describe("NumberField", () => {
  // PRD 第 9 節 #8：貸款等欄位不得為負數——不只是把結果 clamp 成 0，
  // 負號本身要被即時濾掉，畫面上不該讓使用者看到自己「打得出」負數
  it("設定 min={0} 時，負號會被即時濾掉而不是整個變成 0", () => {
    const onChange = vi.fn();
    render(
      <NumberField label="銀行貸款餘額" value={0} min={0} onChange={onChange} />
    );

    const input = screen.getByLabelText("銀行貸款餘額") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-500" } });

    expect(input.value).toBe("500");
    expect(onChange).toHaveBeenCalledWith(500);
  });

  it("未設定 min 時允許負數（現金流情境），且負號只保留開頭那一個", () => {
    const onChange = vi.fn();
    render(<NumberField label="本月現金流" value={0} onChange={onChange} />);

    const input = screen.getByLabelText("本月現金流") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-500" } });
    expect(input.value).toBe("-500");
    expect(onChange).toHaveBeenCalledWith(-500);

    fireEvent.change(input, { target: { value: "-12-34" } });
    expect(input.value).toBe("-1234");
  });

  // 防呆貼上非數字字元（type="number" 原生限制擋不住貼上事件），畫面上直接濾掉字母
  it("貼上含有非數字字元的內容時，會即時濾掉字母只留下數字", () => {
    const onChange = vi.fn();
    render(
      <NumberField label="美股市值" value={0} min={0} onChange={onChange} />
    );

    const input = screen.getByLabelText("美股市值") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12a3b4" } });

    expect(input.value).toBe("1234");
    expect(onChange).toHaveBeenCalledWith(1234);
  });

  it("只保留第一個小數點，避免出現如 1.2.3 的非法數字", () => {
    render(
      <NumberField label="美股匯率" value={0} min={0} onChange={vi.fn()} />
    );

    const input = screen.getByLabelText("美股匯率") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1.2.3" } });

    expect(input.value).toBe("1.23");
  });

  // PRD 第 9 節 #9：非數字/空值輸入視為 0（type="number" 欄位在瀏覽器層級已擋掉非數字字元，
  // 因此以「清空欄位」模擬空值情境，行為與非數字輸入相同：一律 fallback 為 0）
  it("清空欄位（空值）視為 0", () => {
    const onChange = vi.fn();
    render(
      <NumberField label="美股匯率" value={32} min={0} onChange={onChange} />
    );

    fireEvent.change(screen.getByLabelText("美股匯率"), {
      target: { value: "" },
    });

    expect(onChange).toHaveBeenCalledWith(0);
  });

  // 數值為 0 時顯示空字串而非文字「0」，避免打字時插入既有的 0 造成如 01000 的錯誤結果
  it("數值為 0 時欄位顯示空白，避免殘留的 0 與新輸入疊加", () => {
    render(
      <NumberField label="銀行貸款餘額" value={0} min={0} onChange={vi.fn()} />
    );

    const input = screen.getByLabelText("銀行貸款餘額") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  // 聚焦時全選內容，確保打字一律覆蓋既有數值而非插入
  it("欄位取得焦點時會全選現有內容", () => {
    render(
      <NumberField label="美股匯率" value={5000} min={0} onChange={vi.fn()} />
    );
    const input = screen.getByLabelText("美股匯率") as HTMLInputElement;
    const selectSpy = vi.spyOn(input, "select");

    fireEvent.focus(input);

    expect(selectSpy).toHaveBeenCalledTimes(1);
  });
});
