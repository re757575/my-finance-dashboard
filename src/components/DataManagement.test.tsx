import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataManagement } from "@/components/DataManagement";

describe("DataManagement", () => {
  it("點擊匯出備份按鈕會呼叫 onExport", () => {
    const onExport = vi.fn();
    render(
      <DataManagement
        onExport={onExport}
        onImport={vi.fn()}
        onClearConfirmed={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("匯出備份"));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  // PRD 4.2 節，決策 Q9 選項 C：清空前必須先強制觸發匯出
  it("點擊清空本地資料：先觸發匯出，再顯示二次確認對話框", () => {
    const onExport = vi.fn();
    const onClearConfirmed = vi.fn();
    render(
      <DataManagement
        onExport={onExport}
        onImport={vi.fn()}
        onClearConfirmed={onClearConfirmed}
      />
    );

    fireEvent.click(screen.getByText("清空本地資料"));

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(screen.getByText("確認清空所有本地資料？")).toBeInTheDocument();
    expect(onClearConfirmed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("確認清空"));
    expect(onClearConfirmed).toHaveBeenCalledTimes(1);
  });

  it("取消清空對話框時不會呼叫 onClearConfirmed", () => {
    render(
      <DataManagement
        onExport={vi.fn()}
        onImport={vi.fn()}
        onClearConfirmed={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("清空本地資料"));
    fireEvent.click(screen.getAllByText("取消")[0]);

    expect(
      screen.queryByText("確認清空所有本地資料？")
    ).not.toBeInTheDocument();
  });

  // PRD 4.2 節：匯入前需二次確認，因為會覆蓋現有資料
  it("選擇檔案後顯示匯入二次確認，確認後呼叫 onImport", async () => {
    const onImport = vi.fn().mockResolvedValue({ ok: true });
    const { container } = render(
      <DataManagement
        onExport={vi.fn()}
        onImport={onImport}
        onClearConfirmed={vi.fn()}
      />
    );

    const file = new File(
      ['{"schemaVersion":1,"snapshots":[]}'],
      "backup.json",
      {
        type: "application/json",
      }
    );
    const fileInput = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByText("確認匯入備份？")).toBeInTheDocument();

    fireEvent.click(screen.getByText("確認覆蓋匯入"));

    await waitFor(() => expect(onImport).toHaveBeenCalledWith(file));
    await waitFor(() =>
      expect(screen.queryByText("確認匯入備份？")).not.toBeInTheDocument()
    );
  });

  it("匯入失敗時顯示錯誤訊息，對話框保持開啟", async () => {
    const onImport = vi
      .fn()
      .mockResolvedValue({ ok: false, reason: "版本不相容" });
    const { container } = render(
      <DataManagement
        onExport={vi.fn()}
        onImport={onImport}
        onClearConfirmed={vi.fn()}
      />
    );

    const file = new File(["bad"], "backup.json", { type: "application/json" });
    const fileInput = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText("確認覆蓋匯入"));

    await waitFor(() =>
      expect(screen.getByText("版本不相容")).toBeInTheDocument()
    );
    expect(screen.getByText("確認匯入備份？")).toBeInTheDocument();
  });
});
