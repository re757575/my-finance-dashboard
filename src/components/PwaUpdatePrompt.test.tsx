import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";

describe("PwaUpdatePrompt", () => {
  it("預設不顯示更新提示（尚未偵測到新版本）", () => {
    render(<PwaUpdatePrompt />);
    expect(screen.queryByTestId("pwa-update-prompt")).not.toBeInTheDocument();
  });
});
