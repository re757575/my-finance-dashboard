import { render, screen } from "@testing-library/react";
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
    render(<DebtRatioBar ratio={50} status={status} />);
    expect(screen.getByTestId("debt-ratio-status")).toHaveTextContent(label);
  });

  it("顯示百分比數值", () => {
    render(<DebtRatioBar ratio={42.5} status="elevated" />);
    expect(screen.getByTestId("debt-ratio-value")).toHaveTextContent("42.5%");
  });

  it("負債比超過 100% 時，進度條寬度仍夾在 100%", () => {
    render(<DebtRatioBar ratio={150} status="high-risk" />);
    expect(screen.getByTestId("debt-ratio-bar-fill")).toHaveStyle({
      width: "100%",
    });
  });
});
