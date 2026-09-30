import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssetAllocationBar } from "@/components/AssetAllocationBar";

const baseProps = {
  cashRatio: 35,
  restrictedCashRatio: 0,
  twStockRatio: 40,
  usStockRatio: 25,
  financialAssets: 1000000,
  liquidCash: 350000,
  restrictedCash: 0,
  twStockValue: 400000,
  usStockValueInTwd: 250000,
  realEstateValue: 0,
};

describe("AssetAllocationBar", () => {
  // PRD 第 9 節 #29：三色塊比例正確加總為 100%
  it("依比例畫出三個色塊，寬度對應各自佔比", () => {
    render(<AssetAllocationBar {...baseProps} />);
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

  // PRD 第 9 節 #29a：金融資產為 0 時顯示空狀態提示文字，不畫出全零長條
  it("金融資產為 0 時顯示空狀態提示文字", () => {
    render(
      <AssetAllocationBar
        {...baseProps}
        cashRatio={0}
        twStockRatio={0}
        usStockRatio={0}
        financialAssets={0}
        liquidCash={0}
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
        {...baseProps}
        cashRatio={100}
        twStockRatio={0}
        usStockRatio={0}
        financialAssets={100000}
        liquidCash={100000}
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
    render(<AssetAllocationBar {...baseProps} />);

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

  // PRD 第 9 節 #40a：不可動用現金以獨立色塊呈現，四段加總為 100%
  it("存在不可動用現金時，多出一個「不可動用現金」色塊與圖例", () => {
    render(
      <AssetAllocationBar
        {...baseProps}
        cashRatio={20}
        restrictedCashRatio={10}
        twStockRatio={40}
        usStockRatio={30}
        liquidCash={200000}
        restrictedCash={100000}
        usStockValueInTwd={300000}
      />
    );

    expect(
      screen.getByTestId("asset-allocation-segment-restrictedCash")
    ).toHaveStyle({ width: "10%" });
    expect(screen.getByText("不可動用現金 10.0%")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("資產配置比例計算公式說明"));
    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "不可動用現金：$100,000 ÷ $1,000,000 × 100% = 10.0%"
    );
  });

  // PRD 第 9 節 #40c：沒有不可動用現金時，不顯示該色塊
  it("沒有不可動用現金時，不顯示「不可動用現金」色塊與圖例", () => {
    render(<AssetAllocationBar {...baseProps} />);

    expect(
      screen.queryByTestId("asset-allocation-segment-restrictedCash")
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/不可動用現金/)).not.toBeInTheDocument();
  });

  // PRD 第 9 節 #41a／#41b：不動產不列入長條圖，只以備註顯示；為 0 時不顯示
  it("填入不動產時，於長條圖下方顯示備註；為 0 時不顯示", () => {
    const { rerender } = render(
      <AssetAllocationBar {...baseProps} realEstateValue={10000000} />
    );
    expect(
      screen.getByTestId("asset-allocation-real-estate-note")
    ).toHaveTextContent("不動產 $10,000,000（不計入配置比例）");

    rerender(<AssetAllocationBar {...baseProps} realEstateValue={0} />);
    expect(
      screen.queryByTestId("asset-allocation-real-estate-note")
    ).not.toBeInTheDocument();
  });

  it("金融資產為 0 但有不動產時，空狀態下仍顯示不動產備註", () => {
    render(
      <AssetAllocationBar
        {...baseProps}
        cashRatio={0}
        twStockRatio={0}
        usStockRatio={0}
        financialAssets={0}
        liquidCash={0}
        twStockValue={0}
        usStockValueInTwd={0}
        realEstateValue={5000000}
      />
    );
    expect(screen.getByTestId("asset-allocation-empty")).toBeInTheDocument();
    expect(
      screen.getByTestId("asset-allocation-real-estate-note")
    ).toHaveTextContent("$5,000,000");
  });
});
