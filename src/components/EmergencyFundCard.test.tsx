import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmergencyFundCard } from "@/components/EmergencyFundCard";
import type { EmergencyFundStatus } from "@/types/schema";

describe("EmergencyFundCard", () => {
  // PRD 第 7 節無障礙規範：狀態不得只靠顏色，必須同時顯示文字標籤
  it.each([
    { status: "no-need" as EmergencyFundStatus, label: "無需求" },
    { status: "insufficient" as EmergencyFundStatus, label: "預備金不足" },
    { status: "basic" as EmergencyFundStatus, label: "基本安全" },
    { status: "sufficient" as EmergencyFundStatus, label: "預備充足" },
  ])("狀態 $status 會顯示對應文字標籤 $label", ({ status, label }) => {
    render(<EmergencyFundCard months={5} status={status} />);
    expect(screen.getByTestId("emergency-fund-status")).toHaveTextContent(
      label
    );
  });

  it("顯示月數到小數點後 1 位", () => {
    render(<EmergencyFundCard months={5.34} status="basic" />);
    expect(screen.getByTestId("emergency-fund-value")).toHaveTextContent(
      "5.3 個月"
    );
  });

  // PRD 第 9 節 #27a：分母為 0 時顯示「∞」
  it("月數為 null 時顯示「∞」", () => {
    render(<EmergencyFundCard months={null} status="no-need" />);
    expect(screen.getByTestId("emergency-fund-value")).toHaveTextContent("∞");
  });
});
