import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "@/components/Footer";

describe("Footer", () => {
  it("顯示目前 app 版本號", () => {
    render(<Footer />);
    expect(
      screen.getByText(`個人資產負債儀表板 v${__APP_VERSION__}`)
    ).toBeInTheDocument();
  });
});
