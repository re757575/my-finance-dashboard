import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PledgeMaintenanceCard } from "@/components/PledgeMaintenanceCard";
import type { PledgeMaintenanceStatus } from "@/types/schema";

describe("PledgeMaintenanceCard", () => {
  // PRD 第 9 節 #42d：無質押負債時不顯示卡片
  it("狀態為 none 時不渲染任何內容", () => {
    const { container } = render(
      <PledgeMaintenanceCard
        ratio={null}
        status="none"
        pledgePrincipal={0}
        pledgeCollateralValue={0}
        dropToMarginCall={null}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  // PRD 第 9 節 #42c：尚未填寫質押股票市值
  it("狀態為 unset 時只顯示引導文字，不顯示百分比與狀態標籤", () => {
    render(
      <PledgeMaintenanceCard
        ratio={null}
        status="unset"
        pledgePrincipal={500000}
        pledgeCollateralValue={0}
        dropToMarginCall={null}
      />
    );
    expect(screen.getByTestId("pledge-maintenance-unset")).toHaveTextContent(
      "尚未填寫質押股票市值"
    );
    expect(
      screen.queryByTestId("pledge-maintenance-value")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("pledge-maintenance-status")
    ).not.toBeInTheDocument();
  });

  // PRD 第 7 節無障礙規範：狀態不得只靠顏色，必須同時顯示文字標籤
  it.each([
    {
      status: "safe" as PledgeMaintenanceStatus,
      ratio: 170,
      label: "維持率安全",
    },
    {
      status: "watch" as PledgeMaintenanceStatus,
      ratio: 150,
      label: "維持率留意",
    },
    {
      status: "warning" as PledgeMaintenanceStatus,
      ratio: 135,
      label: "接近追繳線",
    },
    {
      status: "margin-call" as PledgeMaintenanceStatus,
      ratio: 120,
      label: "低於追繳線",
    },
  ])("狀態 $status 會顯示對應文字標籤 $label", ({ status, ratio, label }) => {
    render(
      <PledgeMaintenanceCard
        ratio={ratio}
        status={status}
        pledgePrincipal={500000}
        pledgeCollateralValue={(500000 * ratio) / 100}
        dropToMarginCall={ratio >= 130 ? (1 - 130 / ratio) * 100 : null}
      />
    );
    expect(screen.getByTestId("pledge-maintenance-status")).toHaveTextContent(
      label
    );
    expect(screen.getByTestId("pledge-maintenance-value")).toHaveTextContent(
      `${ratio.toFixed(1)}%`
    );
  });

  it("維持率高於追繳線時，顯示擔保品再下跌多少會觸及 130% 追繳線", () => {
    render(
      <PledgeMaintenanceCard
        ratio={160}
        status="safe"
        pledgePrincipal={500000}
        pledgeCollateralValue={800000}
        dropToMarginCall={18.75}
      />
    );
    expect(screen.getByTestId("pledge-maintenance-drop")).toHaveTextContent(
      "擔保品再下跌 18.8% 將觸及 130% 追繳線"
    );
  });

  it("已低於追繳線時，改顯示已低於追繳線的提醒", () => {
    render(
      <PledgeMaintenanceCard
        ratio={120}
        status="margin-call"
        pledgePrincipal={500000}
        pledgeCollateralValue={600000}
        dropToMarginCall={null}
      />
    );
    expect(screen.getByTestId("pledge-maintenance-drop")).toHaveTextContent(
      "已低於追繳線，需補繳擔保品或還款"
    );
  });

  it("進度條寬度以 200% 為滿條，超過時夾在 100%", () => {
    const { rerender } = render(
      <PledgeMaintenanceCard
        ratio={100}
        status="margin-call"
        pledgePrincipal={1}
        pledgeCollateralValue={1}
        dropToMarginCall={null}
      />
    );
    expect(screen.getByTestId("pledge-maintenance-bar-fill")).toHaveStyle({
      width: "50%",
    });

    rerender(
      <PledgeMaintenanceCard
        ratio={400}
        status="safe"
        pledgePrincipal={1}
        pledgeCollateralValue={4}
        dropToMarginCall={67.5}
      />
    );
    expect(screen.getByTestId("pledge-maintenance-bar-fill")).toHaveStyle({
      width: "100%",
    });
  });

  it("點擊公式說明 icon 會顯示代入實際數值的計算過程與追繳線參考說明", () => {
    render(
      <PledgeMaintenanceCard
        ratio={160}
        status="safe"
        pledgePrincipal={500000}
        pledgeCollateralValue={800000}
        dropToMarginCall={18.75}
      />
    );

    fireEvent.click(screen.getByLabelText("質押整戶維持率計算公式說明"));

    const content = screen.getByTestId("formula-info-content");
    expect(content).toHaveTextContent("$800,000 ÷ $500,000 × 100% = 160.0%");
    expect(content).toHaveTextContent("130%");
  });

  it("unset 狀態下也提供公式說明 icon", () => {
    render(
      <PledgeMaintenanceCard
        ratio={null}
        status="unset"
        pledgePrincipal={500000}
        pledgeCollateralValue={0}
        dropToMarginCall={null}
      />
    );
    fireEvent.click(screen.getByLabelText("質押整戶維持率計算公式說明"));
    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "尚未填寫質押股票市值"
    );
  });
});
