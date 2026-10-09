import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFileDrop } from "@/hooks/useFileDrop";

const backup = new File(["{}"], "backup.json", { type: "application/json" });

/** 從檔案總管拖曳檔案時的 dataTransfer（types 含 "Files"）。 */
function fileTransfer(...files: File[]) {
  return { types: ["Files"], files, dropEffect: "none" };
}

/** 拖曳頁面上選取的文字時的 dataTransfer。 */
function textTransfer() {
  return { types: ["text/plain"], files: [], dropEffect: "none" };
}

/** 模擬畫面上有一個 shadcn Dialog（`ui/dialog.tsx` 的 DialogContent）。 */
function mountDialog(state: "open" | "closed") {
  const dialog = document.createElement("div");
  dialog.dataset.slot = "dialog-content";
  dialog.dataset.state = state;
  document.body.append(dialog);
  return dialog;
}

// PRD 4.2「匯入還原」拖曳檔案匯入、第 9 節 #64a～#64i
describe("useFileDrop", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("檔案拖曳進入頁面時為 true，拖離後恢復 false", () => {
    const { result } = renderHook(() => useFileDrop(vi.fn()));
    expect(result.current).toBe(false);

    fireEvent.dragEnter(window, { dataTransfer: fileTransfer(backup) });
    expect(result.current).toBe(true);

    fireEvent.dragLeave(window, { dataTransfer: fileTransfer(backup) });
    expect(result.current).toBe(false);
  });

  it("在子元素之間移動（先進入下一個、才離開上一個）不會誤判為離開頁面", () => {
    const { result } = renderHook(() => useFileDrop(vi.fn()));
    const child = document.body.appendChild(document.createElement("div"));
    const dataTransfer = fileTransfer(backup);

    fireEvent.dragEnter(document.body, { dataTransfer });
    fireEvent.dragEnter(child, { dataTransfer });
    fireEvent.dragLeave(document.body, { dataTransfer });
    expect(result.current).toBe(true);

    fireEvent.dragLeave(child, { dataTransfer });
    expect(result.current).toBe(false);
  });

  it("放開檔案：把檔案交給 onDrop，並結束拖曳狀態", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDrop));
    const second = new File(["{}"], "second.json");
    const dataTransfer = fileTransfer(backup, second);

    fireEvent.dragEnter(window, { dataTransfer });
    fireEvent.drop(window, { dataTransfer });

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith([backup, second]);
    expect(result.current).toBe(false);
  });

  it("放開後計數歸零：下一次拖曳進入、離開各一次即恢復 false", () => {
    const { result } = renderHook(() => useFileDrop(vi.fn()));
    const child = document.body.appendChild(document.createElement("div"));
    const dataTransfer = fileTransfer(backup);

    fireEvent.dragEnter(document.body, { dataTransfer });
    fireEvent.dragEnter(child, { dataTransfer });
    fireEvent.drop(child, { dataTransfer });

    fireEvent.dragEnter(document.body, { dataTransfer });
    expect(result.current).toBe(true);
    fireEvent.dragLeave(document.body, { dataTransfer });
    expect(result.current).toBe(false);
  });

  // 不攔截的話瀏覽器會直接開啟該檔案、離開頁面，未存檔草稿會遺失
  it("檔案拖放一律攔截瀏覽器預設行為，並標示為複製", () => {
    renderHook(() => useFileDrop(vi.fn()));
    const dataTransfer = fileTransfer(backup);

    // fireEvent 回傳 false 代表事件被 preventDefault
    expect(fireEvent.dragEnter(window, { dataTransfer })).toBe(false);
    expect(fireEvent.dragOver(window, { dataTransfer })).toBe(false);
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(fireEvent.drop(window, { dataTransfer })).toBe(false);
  });

  it("拖曳的不是檔案（例如頁面上的文字）：不顯示、不攔截、不呼叫 onDrop", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDrop));
    const dataTransfer = textTransfer();

    expect(fireEvent.dragEnter(window, { dataTransfer })).toBe(true);
    expect(result.current).toBe(false);
    expect(fireEvent.dragOver(window, { dataTransfer })).toBe(true);
    expect(dataTransfer.dropEffect).toBe("none");
    expect(fireEvent.drop(window, { dataTransfer })).toBe(true);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("已有對話框開啟：不顯示、不呼叫 onDrop，但仍攔截瀏覽器預設行為", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDrop));
    mountDialog("open");
    const dataTransfer = fileTransfer(backup);
    dataTransfer.dropEffect = "copy";

    expect(fireEvent.dragEnter(window, { dataTransfer })).toBe(false);
    expect(result.current).toBe(false);
    expect(fireEvent.dragOver(window, { dataTransfer })).toBe(false);
    expect(dataTransfer.dropEffect).toBe("none");
    expect(fireEvent.drop(window, { dataTransfer })).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("拖曳途中對話框開啟：放開時不呼叫 onDrop，拖曳狀態照常結束", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDrop));
    const dataTransfer = fileTransfer(backup);

    fireEvent.dragEnter(window, { dataTransfer });
    expect(result.current).toBe(true);
    mountDialog("open");
    fireEvent.drop(window, { dataTransfer });

    expect(onDrop).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it("對話框正在播放關閉動畫（仍在 DOM 內）不算開啟", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDrop));
    mountDialog("closed");
    const dataTransfer = fileTransfer(backup);

    fireEvent.dragEnter(window, { dataTransfer });
    expect(result.current).toBe(true);
    fireEvent.drop(window, { dataTransfer });
    expect(onDrop).toHaveBeenCalledWith([backup]);
  });

  it("重新渲染後使用最新的 onDrop", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderHook(({ onDrop }) => useFileDrop(onDrop), {
      initialProps: { onDrop: first },
    });

    rerender({ onDrop: latest });
    fireEvent.drop(window, { dataTransfer: fileTransfer(backup) });

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith([backup]);
  });

  it("卸載後移除監聽，不再攔截拖放", () => {
    const onDrop = vi.fn();
    const { unmount } = renderHook(() => useFileDrop(onDrop));

    unmount();

    expect(fireEvent.drop(window, { dataTransfer: fileTransfer(backup) })).toBe(
      true
    );
    expect(onDrop).not.toHaveBeenCalled();
  });
});
