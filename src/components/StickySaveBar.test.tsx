import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StickySaveBar } from "@/components/StickySaveBar";

// PRD 4.2「固定儲存列」、第 9 節 #65g～#65j

describe("StickySaveBar", () => {
  it("沒有未存檔編輯也沒有訊息時不渲染任何內容", () => {
    const { container } = render(
      <StickySaveBar
        hasUnsavedEdits={false}
        editingDate={null}
        message={null}
        onSave={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("有未存檔編輯時顯示提示文字與「更新儀表板」按鈕", () => {
    render(
      <StickySaveBar
        hasUnsavedEdits
        editingDate={null}
        message={null}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByTestId("sticky-save-message")).toHaveTextContent(
      "有未儲存的變更"
    );
    expect(screen.getByTestId("sticky-save-button")).toHaveTextContent(
      "更新儀表板"
    );
  });

  it("修正模式顯示被修正的日期與「儲存修正」按鈕", () => {
    render(
      <StickySaveBar
        hasUnsavedEdits
        editingDate="2026-09-20"
        message={null}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByTestId("sticky-save-message")).toHaveTextContent(
      "修正 2026-09-20：有未儲存的變更"
    );
    expect(screen.getByTestId("sticky-save-button")).toHaveTextContent(
      "儲存修正"
    );
  });

  it("點擊按鈕呼叫 onSave", () => {
    const onSave = vi.fn();
    render(
      <StickySaveBar
        hasUnsavedEdits
        editingDate={null}
        message={null}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByTestId("sticky-save-button"));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("只有結果訊息時顯示訊息、不顯示按鈕", () => {
    render(
      <StickySaveBar
        hasUnsavedEdits={false}
        editingDate={null}
        message="已更新並儲存今日資料。"
        onSave={vi.fn()}
      />
    );

    expect(screen.getByTestId("sticky-save-message")).toHaveTextContent(
      "已更新並儲存今日資料。"
    );
    expect(screen.queryByTestId("sticky-save-button")).not.toBeInTheDocument();
  });

  it("寫入失敗：訊息取代提示文字，按鈕仍在可重試", () => {
    render(
      <StickySaveBar
        hasUnsavedEdits
        editingDate={null}
        message="無法寫入瀏覽器儲存空間（可能已滿或被停用），本次變更尚未存檔。"
        onSave={vi.fn()}
      />
    );

    expect(screen.getByTestId("sticky-save-message")).toHaveTextContent(
      "無法寫入瀏覽器儲存空間"
    );
    expect(screen.getByTestId("sticky-save-message")).not.toHaveTextContent(
      "有未儲存的變更"
    );
    expect(screen.getByTestId("sticky-save-button")).toBeInTheDocument();
  });

  it("訊息以 status 角色呈現，方便輔助科技朗讀", () => {
    render(
      <StickySaveBar
        hasUnsavedEdits
        editingDate={null}
        message={null}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByRole("status")).toBe(
      screen.getByTestId("sticky-save-message")
    );
  });
});
