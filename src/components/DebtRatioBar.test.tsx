import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DebtRatioBar } from "@/components/DebtRatioBar";
import type { DebtRatioStatus } from "@/types/schema";

describe("DebtRatioBar", () => {
  // PRD 第 7 節無障礙規範：燈號不得只靠顏色，必須同時顯示文字標籤
  it.each([
    { status: "debt-free" as DebtRatioStatus, label: "完美無債" },
    { status: "healthy" as DebtRatioStatus, label: "財務健康（安全範圍）" },
    { status: "elevated" as DebtRatioStatus, label: "負債偏高（需注意調控）" },
    {
      status: "high-risk" as DebtRatioStatus,
      label: "財務高風險（請儘速理債）",
    },
  ])("狀態 $status 會顯示對應文字標籤 $label", ({ status, label }) => {
    render(
      <DebtRatioBar
        ratio={50}
        status={status}
        totalLiabilities={500000}
        totalAssets={1000000}
        financialRatio={50}
        financialStatus={status}
        financialLiabilities={500000}
        financialAssets={1000000}
      />
    );
    expect(screen.getByTestId("debt-ratio-status")).toHaveTextContent(label);
  });

  it("顯示百分比數值", () => {
    render(
      <DebtRatioBar
        ratio={42.5}
        status="elevated"
        totalLiabilities={425000}
        totalAssets={1000000}
        financialRatio={42.5}
        financialStatus="elevated"
        financialLiabilities={425000}
        financialAssets={1000000}
      />
    );
    expect(screen.getByTestId("debt-ratio-value")).toHaveTextContent("42.5%");
  });

  it("負債比超過 100% 時，進度條寬度仍夾在 100%", () => {
    render(
      <DebtRatioBar
        ratio={150}
        status="high-risk"
        totalLiabilities={1500000}
        totalAssets={1000000}
        financialRatio={150}
        financialStatus="high-risk"
        financialLiabilities={1500000}
        financialAssets={1000000}
      />
    );
    expect(screen.getByTestId("debt-ratio-bar-fill")).toHaveStyle({
      width: "100%",
    });
  });

  it("點擊公式說明 icon 會顯示代入實際數值的計算過程", () => {
    render(
      <DebtRatioBar
        ratio={30}
        status="healthy"
        totalLiabilities={300000}
        totalAssets={1000000}
        financialRatio={30}
        financialStatus="healthy"
        financialLiabilities={300000}
        financialAssets={1000000}
      />
    );

    fireEvent.click(screen.getByLabelText("負債比計算公式說明"));

    expect(screen.getByTestId("formula-info-content")).toHaveTextContent(
      "$300,000 ÷ $1,000,000 × 100% = 30.0%"
    );
  });

  // PRD 5.1a 節、第 9 節 #60a–#60d：金融負債比
  describe("金融負債比", () => {
    // 現金 100 萬＋台股 300 萬＋不動產 1,200 萬；房貸 600 萬＋信貸 40 萬＋質押 120 萬
    const WITH_REAL_ESTATE = {
      ratio: 47.5,
      status: "elevated",
      totalLiabilities: 7600000,
      totalAssets: 16000000,
      financialRatio: 40,
      financialStatus: "elevated",
      financialLiabilities: 1600000,
      financialAssets: 4000000,
    } as const;

    it("有不動產與房貸時，另列金融負債比與文字標籤，主數字與燈號不變", () => {
      render(<DebtRatioBar {...WITH_REAL_ESTATE} />);

      expect(screen.getByTestId("debt-ratio-value")).toHaveTextContent("47.5%");
      expect(screen.getByTestId("debt-ratio-status")).toHaveTextContent(
        "負債偏高（需注意調控）"
      );
      expect(screen.getByTestId("financial-debt-ratio")).toHaveTextContent(
        "金融負債比（不含不動產與房貸）"
      );
      expect(
        screen.getByTestId("financial-debt-ratio-value")
      ).toHaveTextContent("40.0%");
      expect(
        screen.getByTestId("financial-debt-ratio-status")
      ).toHaveTextContent("負債偏高（需注意調控）");
    });

    it("金融負債比的燈號獨立於負債比：整體健康但金融槓桿過高", () => {
      render(
        <DebtRatioBar
          ratio={35}
          status="healthy"
          totalLiabilities={7000000}
          totalAssets={20000000}
          financialRatio={66.7}
          financialStatus="high-risk"
          financialLiabilities={2000000}
          financialAssets={3000000}
        />
      );

      expect(screen.getByTestId("debt-ratio-status")).toHaveTextContent(
        "財務健康（安全範圍）"
      );
      expect(
        screen.getByTestId("financial-debt-ratio-status")
      ).toHaveTextContent("財務高風險（請儘速理債）");
    });

    it("只有房貸時，金融負債比為 0% 並顯示「完美無債」", () => {
      render(
        <DebtRatioBar
          ratio={54.5}
          status="elevated"
          totalLiabilities={6000000}
          totalAssets={11000000}
          financialRatio={0}
          financialStatus="debt-free"
          financialLiabilities={0}
          financialAssets={1000000}
        />
      );

      expect(
        screen.getByTestId("financial-debt-ratio-value")
      ).toHaveTextContent("0.0%");
      expect(
        screen.getByTestId("financial-debt-ratio-status")
      ).toHaveTextContent("完美無債");
    });

    it("沒有不動產也沒有房貸時（與負債比相同），不重複顯示", () => {
      render(
        <DebtRatioBar
          ratio={30}
          status="healthy"
          totalLiabilities={300000}
          totalAssets={1000000}
          financialRatio={30}
          financialStatus="healthy"
          financialLiabilities={300000}
          financialAssets={1000000}
        />
      );

      expect(
        screen.queryByTestId("financial-debt-ratio")
      ).not.toBeInTheDocument();
    });

    it("金融資產為 0（金融負債比為 null）時不顯示", () => {
      render(
        <DebtRatioBar
          ratio={51}
          status="elevated"
          totalLiabilities={5100000}
          totalAssets={10000000}
          financialRatio={null}
          financialStatus={null}
          financialLiabilities={100000}
          financialAssets={0}
        />
      );

      expect(
        screen.queryByTestId("financial-debt-ratio")
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("debt-ratio-value")).toHaveTextContent("51.0%");
    });

    it("顯示金融負債比時，公式說明同時列出兩者的代入數值", () => {
      render(<DebtRatioBar {...WITH_REAL_ESTATE} />);

      fireEvent.click(screen.getByLabelText("負債比計算公式說明"));

      const content = screen.getByTestId("formula-info-content");
      expect(content).toHaveTextContent(
        "$7,600,000 ÷ $16,000,000 × 100% = 47.5%"
      );
      expect(content).toHaveTextContent(
        "$1,600,000 ÷ $4,000,000 × 100% = 40.0%"
      );
    });
  });
});
