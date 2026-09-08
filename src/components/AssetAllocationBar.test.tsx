import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssetAllocationBar } from "@/components/AssetAllocationBar";

describe("AssetAllocationBar", () => {
  // PRD 第 9 節 #29：三色塊比例正確加總為 100%
  it("依比例畫出三個色塊，寬度對應各自佔比", () => {
    render(
      <AssetAllocationBar
        cashRatio={35}
        twStockRatio={40}
        usStockRatio={25}
        totalAssets={1000000}
        totalCash={350000}
        twStockValue={400000}
        usStockValueInTwd={250000}
      />
    );
    expect(screen.getByTestId("asset-allocation-segment-cash")).toHaveStyle({
      width: "35%",
    });
    expect(screen.getByTestId("asset-allocation-segment-twStock")).toHaveStyle({
      width: "40%",
    });
    expect(screen.getByTestId("asset-allocation-segment-usStock")).toHaveStyle({
      width: "25%",
    });
  });

  // PRD 第 9 節 #29a：總資產為 0 時顯示空狀態提示文字，不畫出全零長條
  it("總資產為 0 時顯示空狀態提示文字", () => {
    render(
      <AssetAllocationBar
        cashRatio={0}
        twStockRatio={0}
        usStockRatio={0}
        totalAssets={0}
        totalCash={0}
        twStockValue={0}
        usStockValueInTwd={0}
      />
    );
    expect(screen.getByTestId("asset-allocation-empty")).toHaveTextContent(
      "尚未輸入任何資產"
    );
    expect(
      screen.queryByTestId("asset-allocation-segment-cash")
    ).not.toBeInTheDocument();
  });

  it("某一類佔比為 0 時，不畫出該色塊", () => {
    render(
      <AssetAllocationBar
        cashRatio={100}
        twStockRatio={0}
        usStockRatio={0}
        totalAssets={100000}
        totalCash={100000}
        twStockValue={0}
        usStockValueInTwd={0}
      />
    );
    expect(
      screen.getByTestId("asset-allocation-segment-cash")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("asset-allocation-segment-twStock")
    ).not.toBeInTheDocument();
  });

  it("點擊公式說明 icon 會顯示三類代入實際數值的計算過程", () => {
    render(
      <AssetAllocationBar
        cashRatio={35}
        twStockRatio={40}
        usStockRatio={25}
        totalAssets={1000000}
        totalCash={350000}
        twStockValue={400000}
        usStockValueInTwd={250000}
      />
    );

    fireEvent.click(screen.getByLabelText("資產配置比例計算公式說明"));

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent(
      "現金：$350,000 ÷ $1,000,000 × 100% = 35.0%"
    );
    expect(content).toHaveTextContent(
      "台股：$400,000 ÷ $1,000,000 × 100% = 40.0%"
    );
    expect(content).toHaveTextContent(
      "美股：$250,000 ÷ $1,000,000 × 100% = 25.0%"
    );
  });
});
