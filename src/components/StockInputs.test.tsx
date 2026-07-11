import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StockInputs } from "@/components/StockInputs";

describe("StockInputs", () => {
  it("預設 USD 模式：股票市值合計會乘上匯率", () => {
    render(
      <StockInputs
        twStockValue={100000}
        usStockValue={1000}
        usStockCurrency="USD"
        exchangeRate={32}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText("股票市值合計：$132,000")).toBeInTheDocument();
    // NumberField 的 suffix（USD/TWD）也在同一個 <label> 內，故 label 全文並非精確等於「美股匯率」
    expect(screen.getByLabelText(/^美股匯率/)).toBeInTheDocument();
  });

  it("TWD 模式：股票市值合計不乘匯率，且隱藏匯率欄位", () => {
    render(
      <StockInputs
        twStockValue={100000}
        usStockValue={32000}
        usStockCurrency="TWD"
        exchangeRate={32}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText("股票市值合計：$132,000")).toBeInTheDocument();
    expect(screen.queryByLabelText("美股匯率")).not.toBeInTheDocument();
  });

  it("點擊 TWD 切換按鈕會呼叫 onChange 帶入 usStockCurrency: TWD", () => {
    const onChange = vi.fn();
    render(
      <StockInputs
        twStockValue={0}
        usStockValue={0}
        usStockCurrency="USD"
        exchangeRate={0}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "TWD" }));

    expect(onChange).toHaveBeenCalledWith({ usStockCurrency: "TWD" });
  });

  it("美股市值欄位的幣別後綴會隨切換而改變", () => {
    const { rerender } = render(
      <StockInputs
        twStockValue={0}
        usStockValue={0}
        usStockCurrency="USD"
        exchangeRate={0}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText("美股市值").parentElement).toHaveTextContent(
      "USD"
    );

    rerender(
      <StockInputs
        twStockValue={0}
        usStockValue={0}
        usStockCurrency="TWD"
        exchangeRate={0}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText("美股市值").parentElement).toHaveTextContent(
      "TWD"
    );
  });
});
