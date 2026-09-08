import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChartExpandButton } from "@/components/charts/ChartExpandButton";

describe("ChartExpandButton", () => {
  it("點擊按鈕會開啟 Dialog 並顯示標題與內容", () => {
    render(
      <ChartExpandButton title="淨資產趨勢">
        <p>圖表內容</p>
      </ChartExpandButton>
    );

    fireEvent.click(screen.getByLabelText("淨資產趨勢全螢幕檢視"));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("淨資產趨勢");
    expect(dialog).toHaveTextContent("圖表內容");
  });

  // 瀏覽器不支援 Fullscreen／Orientation Lock API 時（如 jsdom、iOS Safari），不得拋錯或阻擋 Dialog 開關
  it("裝置不支援全螢幕／橫向鎖定 API 時，仍可正常開關 Dialog 不拋錯", () => {
    render(
      <ChartExpandButton title="負債比趨勢">
        <p>圖表內容</p>
      </ChartExpandButton>
    );

    expect(() => {
      fireEvent.click(screen.getByLabelText("負債比趨勢全螢幕檢視"));
    }).not.toThrow();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    }).not.toThrow();
  });

  describe("裝置支援 Fullscreen／Orientation Lock API 時", () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const lock = vi.fn().mockResolvedValue(undefined);
    const unlock = vi.fn();

    beforeEach(() => {
      requestFullscreen.mockClear();
      exitFullscreen.mockClear();
      lock.mockClear();
      unlock.mockClear();
      Object.defineProperty(document.documentElement, "requestFullscreen", {
        value: requestFullscreen,
        configurable: true,
      });
      Object.defineProperty(document, "exitFullscreen", {
        value: exitFullscreen,
        configurable: true,
      });
      Object.defineProperty(window.screen, "orientation", {
        value: { lock, unlock },
        configurable: true,
      });
    });

    afterEach(() => {
      // @ts-expect-error 測試專用清理，還原為未定義狀態
      delete document.documentElement.requestFullscreen;
      // @ts-expect-error 測試專用清理，還原為未定義狀態
      delete document.exitFullscreen;
    });

    it("開啟 Dialog 會嘗試進入全螢幕並鎖定橫向", async () => {
      render(
        <ChartExpandButton title="淨資產趨勢">
          <p>圖表內容</p>
        </ChartExpandButton>
      );

      fireEvent.click(screen.getByLabelText("淨資產趨勢全螢幕檢視"));

      expect(requestFullscreen).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(lock).toHaveBeenCalledWith("landscape"));
    });

    it("關閉 Dialog 會退出全螢幕並解除橫向鎖定", () => {
      render(
        <ChartExpandButton title="淨資產趨勢">
          <p>圖表內容</p>
        </ChartExpandButton>
      );

      fireEvent.click(screen.getByLabelText("淨資產趨勢全螢幕檢視"));

      Object.defineProperty(document, "fullscreenElement", {
        value: document.documentElement,
        configurable: true,
      });

      fireEvent.click(screen.getByRole("button", { name: "Close" }));

      expect(exitFullscreen).toHaveBeenCalledTimes(1);
      expect(unlock).toHaveBeenCalledTimes(1);

      // @ts-expect-error 測試專用清理
      delete document.fullscreenElement;
    });
  });
});
