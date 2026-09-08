import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CopyPromptButton } from "@/components/CopyPromptButton";
import { calculateMetrics } from "@/lib/calculations";
import { createEmptySnapshot } from "@/types/schema";

function setup() {
  const draft = {
    ...createEmptySnapshot("2026-07-13"),
    cashSources: [{ id: "1", name: "現金", amount: 350000 }],
    twStockValue: 400000,
  };
  render(
    <CopyPromptButton
      currentDate="2026-07-13"
      draft={draft}
      metrics={calculateMetrics(draft)}
      recentSnapshots={[]}
      disabled={false}
    />
  );
}

describe("CopyPromptButton", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("預設為財務健康檢查模式，點擊複製會寫入對應內容", async () => {
    setup();

    fireEvent.click(screen.getByTestId("copy-prompt-button"));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("我的財務健康檢查");
  });

  // PRD 第 9 節 #33：切換模式後複製對應內容
  it("切換為投資方向評估模式後，複製的內容跟著改變", async () => {
    setup();

    fireEvent.change(screen.getByLabelText("AI 分析提示詞模式"), {
      target: { value: "investment-direction" },
    });
    fireEvent.click(screen.getByTestId("copy-prompt-button"));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("我的投資方向評估");
    expect(writeText.mock.calls[0][0]).not.toContain("我的財務健康檢查");
  });

  it("disabled 時下拉選單與按鈕皆停用，並顯示提示文字", () => {
    const draft = createEmptySnapshot("2026-07-13");
    render(
      <CopyPromptButton
        currentDate="2026-07-13"
        draft={draft}
        metrics={calculateMetrics(draft)}
        recentSnapshots={[]}
        disabled
      />
    );

    expect(screen.getByLabelText("AI 分析提示詞模式")).toBeDisabled();
    expect(screen.getByTestId("copy-prompt-button")).toBeDisabled();
    expect(
      screen.getByText("先儲存今日資料才能生成提示詞")
    ).toBeInTheDocument();
  });
});
