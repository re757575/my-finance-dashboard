import { useEffect, useRef, useState } from "react";

/** 只處理「檔案」拖曳；拖曳頁面上的文字、連結時 types 不含 "Files"。 */
function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/**
 * 已有對話框開啟時不接受拖放，避免在另一個確認流程上再疊一個匯入確認。
 * 關閉動畫播放中的對話框（data-state="closed"）仍在 DOM 內，不算開啟。
 */
function isDialogOpen(): boolean {
  return (
    document.querySelector(
      '[data-slot="dialog-content"][data-state="open"]'
    ) !== null
  );
}

/**
 * 監聽整個視窗的檔案拖放（PRD 4.2「匯入還原」拖曳檔案匯入）。
 * 回傳值為「目前有檔案拖曳在頁面上」，供呼叫端顯示遮罩；放開時把檔案交給 onDrop。
 *
 * 不論是否接受，檔案拖放的瀏覽器預設行為一律攔截——預設會直接開啟該檔案、離開頁面，
 * 未存檔的草稿會跟著遺失。檔案只交給 onDrop，本身不讀取內容、不發出任何請求。
 */
export function useFileDrop(onDrop: (files: File[]) => void): boolean {
  const [isDragging, setIsDragging] = useState(false);
  const onDropRef = useRef(onDrop);

  useEffect(() => {
    onDropRef.current = onDrop;
  });

  useEffect(() => {
    // dragenter／dragleave 會在每個子元素上各觸發一次，以計數判斷是否真的離開視窗
    let depth = 0;

    const handleDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth += 1;
      if (!isDialogOpen()) setIsDragging(true);
    };
    const handleDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = isDialogOpen() ? "none" : "copy";
      }
    };
    const handleDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDragging(false);
    };
    const handleDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth = 0;
      setIsDragging(false);
      if (isDialogOpen()) return;
      onDropRef.current(Array.from(event.dataTransfer?.files ?? []));
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  return isDragging;
}
