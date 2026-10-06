import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DemoDataOffer } from "@/components/DemoDataOffer";

type LoadResult = { ok: boolean; reason?: string };

/** 回傳一個由測試控制何時完成的 onLoad。 */
function deferredLoad() {
  let resolve!: (result: LoadResult) => void;
  const onLoad = vi.fn(
    () => new Promise<LoadResult>((done) => (resolve = done))
  );
  return { onLoad, resolve: (result: LoadResult) => resolve(result) };
}

function loadButton() {
  return screen.getByRole("button", { name: /載入範例資料|載入中…/ });
}

// PRD 4.2「範例資料」、第 9 節 #63a、#63h、#63k
describe("DemoDataOffer", () => {
  it("顯示標題、說明與「載入範例資料」按鈕", () => {
    render(<DemoDataOffer onLoad={vi.fn()} />);

    const card = screen.getByTestId("demo-data-offer");
    expect(card).toHaveTextContent("第一次使用？先用範例資料試試看");
    expect(card).toHaveTextContent("全部虛構的範例資料");
    expect(screen.getByRole("button", { name: "載入範例資料" })).toBeEnabled();
  });

  it("說明資料只存在這個瀏覽器，且會取代表單上尚未存檔的內容", () => {
    render(<DemoDataOffer onLoad={vi.fn()} />);

    const card = screen.getByTestId("demo-data-offer");
    expect(card).toHaveTextContent("資料只存在這個瀏覽器");
    expect(card).toHaveTextContent("隨時可以一鍵清除");
    expect(card).toHaveTextContent("載入後會取代表單上尚未存檔的內容");
  });

  it("尚未操作時不顯示錯誤訊息", () => {
    render(<DemoDataOffer onLoad={vi.fn()} />);

    expect(screen.queryByTestId("demo-data-error")).not.toBeInTheDocument();
  });

  it("點擊按鈕呼叫 onLoad 一次", async () => {
    const onLoad = vi.fn().mockResolvedValue({ ok: true });
    render(<DemoDataOffer onLoad={onLoad} />);

    fireEvent.click(loadButton());

    await waitFor(() => expect(loadButton()).toBeEnabled());
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it("載入中按鈕改顯示「載入中…」並停用，完成後恢復", async () => {
    const { onLoad, resolve } = deferredLoad();
    render(<DemoDataOffer onLoad={onLoad} />);

    fireEvent.click(loadButton());

    expect(
      await screen.findByRole("button", { name: "載入中…" })
    ).toBeDisabled();

    resolve({ ok: true });

    expect(
      await screen.findByRole("button", { name: "載入範例資料" })
    ).toBeEnabled();
  });

  it("載入中重複點擊不會再次呼叫 onLoad", async () => {
    const { onLoad, resolve } = deferredLoad();
    render(<DemoDataOffer onLoad={onLoad} />);

    fireEvent.click(loadButton());
    await screen.findByRole("button", { name: "載入中…" });
    fireEvent.click(loadButton());

    expect(onLoad).toHaveBeenCalledTimes(1);
    resolve({ ok: true });
    await screen.findByRole("button", { name: "載入範例資料" });
  });

  it("載入成功時不顯示錯誤訊息", async () => {
    const onLoad = vi.fn().mockResolvedValue({ ok: true });
    render(<DemoDataOffer onLoad={onLoad} />);

    fireEvent.click(loadButton());

    await waitFor(() => expect(onLoad).toHaveBeenCalled());
    await waitFor(() => expect(loadButton()).toBeEnabled());
    expect(screen.queryByTestId("demo-data-error")).not.toBeInTheDocument();
  });

  it("載入失敗時以 alert 顯示原因，按鈕恢復可點擊", async () => {
    const onLoad = vi.fn().mockResolvedValue({
      ok: false,
      reason: "瀏覽器中已有資料，為避免覆蓋，已取消載入範例資料。",
    });
    render(<DemoDataOffer onLoad={onLoad} />);

    fireEvent.click(loadButton());

    const error = await screen.findByTestId("demo-data-error");
    expect(error).toHaveTextContent(
      "瀏覽器中已有資料，為避免覆蓋，已取消載入範例資料。"
    );
    expect(error).toHaveAttribute("role", "alert");
    expect(screen.getByRole("button", { name: "載入範例資料" })).toBeEnabled();
  });

  it("失敗但沒有原因時顯示預設訊息", async () => {
    const onLoad = vi.fn().mockResolvedValue({ ok: false });
    render(<DemoDataOffer onLoad={onLoad} />);

    fireEvent.click(loadButton());

    expect(await screen.findByTestId("demo-data-error")).toHaveTextContent(
      "範例資料載入失敗，請重試。"
    );
  });

  it("重試時先清除上一次的錯誤訊息", async () => {
    const onLoad = vi
      .fn<() => Promise<LoadResult>>()
      .mockResolvedValueOnce({ ok: false, reason: "第一次失敗" })
      .mockResolvedValueOnce({ ok: true });
    render(<DemoDataOffer onLoad={onLoad} />);

    fireEvent.click(loadButton());
    expect(await screen.findByTestId("demo-data-error")).toHaveTextContent(
      "第一次失敗"
    );

    fireEvent.click(loadButton());

    await waitFor(() =>
      expect(screen.queryByTestId("demo-data-error")).not.toBeInTheDocument()
    );
    expect(onLoad).toHaveBeenCalledTimes(2);
  });
});
