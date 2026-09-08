import { render, screen } from "@testing-library/react";
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
      />
    );
    expect(
      screen.getByTestId("asset-allocation-segment-cash")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("asset-allocation-segment-twStock")
    ).not.toBeInTheDocument();
  });
});
