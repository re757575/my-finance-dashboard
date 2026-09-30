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

  // PRD 4.2「備份提醒」第 5 點：固定顯示上次備份
  describe("上次備份顯示", () => {
    function renderWith(lastBackupAt: string | null) {
      render(
        <DataManagement
          onExport={vi.fn()}
          onImport={vi.fn()}
          onClearConfirmed={vi.fn()}
          backupStatus={{ lastBackupAt, currentDate: "2026-09-30" }}
        />
      );
    }

    it("未提供 backupStatus 時不顯示這一行", () => {
      render(
        <DataManagement
          onExport={vi.fn()}
          onImport={vi.fn()}
          onClearConfirmed={vi.fn()}
        />
      );
      expect(screen.queryByTestId("last-backup")).not.toBeInTheDocument();
    });

    it("從未備份：顯示「上次備份：尚未備份」", () => {
      renderWith(null);
      expect(screen.getByTestId("last-backup")).toHaveTextContent(
        "上次備份：尚未備份"
      );
    });

    it("數天前：顯示日期與天數", () => {
      renderWith(new Date(2026, 8, 25, 12, 0, 0).toISOString());
      expect(screen.getByTestId("last-backup")).toHaveTextContent(
        "上次備份：2026-09-25（5 天前）"
      );
    });

    it("今天：顯示「今天」", () => {
      renderWith(new Date(2026, 8, 30, 9, 0, 0).toISOString());
      expect(screen.getByTestId("last-backup")).toHaveTextContent(
        "上次備份：2026-09-30（今天）"
      );
    });
  });

  // PRD 4.2「加密匯出備份」
  describe("加密匯出", () => {
    function setup(
      onExportEncrypted = vi.fn().mockResolvedValue({ ok: true })
    ) {
      render(
        <DataManagement
          onExport={vi.fn()}
          onExportEncrypted={onExportEncrypted}
          onImport={vi.fn()}
          onClearConfirmed={vi.fn()}
        />
      );
      return onExportEncrypted;
    }

    function fillPasswords(password: string, confirm = password) {
      fireEvent.change(screen.getByLabelText("加密密碼"), {
        target: { value: password },
      });
      fireEvent.change(screen.getByLabelText("確認加密密碼"), {
        target: { value: confirm },
      });
    }

    it("未提供 onExportEncrypted 時不顯示「加密匯出」按鈕", () => {
      render(
        <DataManagement
          onExport={vi.fn()}
          onImport={vi.fn()}
          onClearConfirmed={vi.fn()}
        />
      );
      expect(screen.queryByText("加密匯出")).not.toBeInTheDocument();
    });

    it("點擊「加密匯出」開啟對話框，並提醒忘記密碼無法還原", () => {
      setup();

      fireEvent.click(screen.getByText("加密匯出"));

      expect(screen.getByText("加密匯出備份")).toBeInTheDocument();
      expect(
        screen.getByText(/忘記密碼將無法還原，系統不會儲存密碼/)
      ).toBeInTheDocument();
      expect(screen.getByLabelText("加密密碼")).toHaveAttribute(
        "type",
        "password"
      );
      expect(screen.getByLabelText("確認加密密碼")).toHaveAttribute(
        "type",
        "password"
      );
    });

    // PRD 第 9 節 #45a：密碼至少 6 個字元
    it("密碼少於 6 個字元：顯示錯誤，不呼叫匯出、不關閉對話框", () => {
      const onExportEncrypted = setup();
      fireEvent.click(screen.getByText("加密匯出"));

      fillPasswords("12345");
      fireEvent.click(screen.getByText("加密並下載"));

      expect(screen.getByTestId("encrypt-error")).toHaveTextContent(
        "密碼至少需要 6 個字元"
      );
      expect(onExportEncrypted).not.toHaveBeenCalled();
      expect(screen.getByText("加密匯出備份")).toBeInTheDocument();
    });

    it("恰為 6 個字元即可通過", async () => {
      const onExportEncrypted = setup();
      fireEvent.click(screen.getByText("加密匯出"));

      fillPasswords("123456");
      fireEvent.click(screen.getByText("加密並下載"));

      await waitFor(() =>
        expect(onExportEncrypted).toHaveBeenCalledWith("123456")
      );
    });

    it("兩次密碼不一致：顯示錯誤，不呼叫匯出", () => {
      const onExportEncrypted = setup();
      fireEvent.click(screen.getByText("加密匯出"));

      fillPasswords("correct-horse", "correct-horsE");
      fireEvent.click(screen.getByText("加密並下載"));

      expect(screen.getByTestId("encrypt-error")).toHaveTextContent(
        "兩次輸入的密碼不一致"
      );
      expect(onExportEncrypted).not.toHaveBeenCalled();
    });

    it("成功：以輸入的密碼呼叫匯出並關閉對話框", async () => {
      const onExportEncrypted = setup();
      fireEvent.click(screen.getByText("加密匯出"));

      fillPasswords("correct-horse");
      fireEvent.click(screen.getByText("加密並下載"));

      await waitFor(() =>
        expect(onExportEncrypted).toHaveBeenCalledWith("correct-horse")
      );
      await waitFor(() =>
        expect(screen.queryByText("加密匯出備份")).not.toBeInTheDocument()
      );
    });

    // PRD 第 9 節 #45h
    it("匯出失敗（例如環境不支援）：顯示原因，對話框保持開啟", async () => {
      const onExportEncrypted = vi.fn().mockResolvedValue({
        ok: false,
        reason: "此環境不支援加密（需要 HTTPS）",
      });
      setup(onExportEncrypted);
      fireEvent.click(screen.getByText("加密匯出"));

      fillPasswords("correct-horse");
      fireEvent.click(screen.getByText("加密並下載"));

      await waitFor(() =>
        expect(screen.getByTestId("encrypt-error")).toHaveTextContent(
          "此環境不支援加密（需要 HTTPS）"
        )
      );
      expect(screen.getByText("加密匯出備份")).toBeInTheDocument();
    });

    it("加密進行中按鈕顯示「加密中…」並停用，避免重複送出", async () => {
      let resolveExport: (v: { ok: boolean }) => void = () => {};
      const onExportEncrypted = vi.fn(
        () =>
          new Promise<{ ok: boolean }>((resolve) => {
            resolveExport = resolve;
          })
      );
      setup(onExportEncrypted);
      fireEvent.click(screen.getByText("加密匯出"));

      fillPasswords("correct-horse");
      fireEvent.click(screen.getByText("加密並下載"));

      const busy = await screen.findByText("加密中…");
      expect(busy.closest("button")).toBeDisabled();

      resolveExport({ ok: true });
      await waitFor(() =>
        expect(screen.queryByText("加密匯出備份")).not.toBeInTheDocument()
      );
    });

    it("取消或關閉後再開啟，先前輸入的密碼與錯誤訊息都已清除", () => {
      setup();
      fireEvent.click(screen.getByText("加密匯出"));
      fillPasswords("abc");
      fireEvent.click(screen.getByText("加密並下載"));
      expect(screen.getByTestId("encrypt-error")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "取消" }));
      fireEvent.click(screen.getByText("加密匯出"));

      expect(screen.getByLabelText("加密密碼")).toHaveValue("");
      expect(screen.getByLabelText("確認加密密碼")).toHaveValue("");
      expect(screen.queryByTestId("encrypt-error")).not.toBeInTheDocument();
    });

    it("不會動到明文的「匯出備份」按鈕", () => {
      const onExport = vi.fn();
      render(
        <DataManagement
          onExport={onExport}
          onExportEncrypted={vi.fn()}
          onImport={vi.fn()}
          onClearConfirmed={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText("匯出備份"));

      expect(onExport).toHaveBeenCalledTimes(1);
    });
  });

  // PRD 4.2「匯入還原」加密備份流程、第 9 節 #45b～#45d
  describe("匯入加密備份", () => {
    const file = new File(["enc"], "backup.enc.json", {
      type: "application/json",
    });

    function selectFile(container: HTMLElement) {
      const fileInput = container.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [file] } });
    }

    it("一般備份不會出現密碼欄", () => {
      const { container } = render(
        <DataManagement
          onExport={vi.fn()}
          onImport={vi.fn()}
          onClearConfirmed={vi.fn()}
        />
      );

      selectFile(container);

      expect(screen.queryByLabelText("備份密碼")).not.toBeInTheDocument();
    });

    it("偵測到加密檔：先顯示密碼欄與提示（不是錯誤），輸入密碼後以密碼匯入並關閉對話框", async () => {
      const onImport = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          needsPassword: true,
          reason: "此備份檔已加密，請輸入密碼。",
        })
        .mockResolvedValueOnce({ ok: true });
      const { container } = render(
        <DataManagement
          onExport={vi.fn()}
          onImport={onImport}
          onClearConfirmed={vi.fn()}
        />
      );
      selectFile(container);

      fireEvent.click(screen.getByText("確認覆蓋匯入"));

      await waitFor(() =>
        expect(screen.getByTestId("import-needs-password")).toHaveTextContent(
          "此備份檔已加密，請輸入密碼"
        )
      );
      expect(onImport).toHaveBeenLastCalledWith(file);
      expect(screen.getByLabelText("備份密碼")).toHaveAttribute(
        "type",
        "password"
      );
      // 這不算錯誤：不顯示紅字錯誤訊息
      expect(
        screen.queryByText("此備份檔已加密，請輸入密碼。")
      ).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("備份密碼"), {
        target: { value: "correct-horse" },
      });
      fireEvent.click(screen.getByText("確認覆蓋匯入"));

      await waitFor(() =>
        expect(onImport).toHaveBeenLastCalledWith(file, "correct-horse")
      );
      await waitFor(() =>
        expect(screen.queryByText("確認匯入備份？")).not.toBeInTheDocument()
      );
    });

    it("密碼錯誤：顯示錯誤，對話框與密碼欄保持開啟，可重新輸入", async () => {
      const onImport = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, needsPassword: true })
        .mockResolvedValueOnce({
          ok: false,
          reason: "密碼錯誤或備份檔已損毀，匯入已取消。",
        });
      const { container } = render(
        <DataManagement
          onExport={vi.fn()}
          onImport={onImport}
          onClearConfirmed={vi.fn()}
        />
      );
      selectFile(container);
      fireEvent.click(screen.getByText("確認覆蓋匯入"));
      await screen.findByLabelText("備份密碼");

      fireEvent.change(screen.getByLabelText("備份密碼"), {
        target: { value: "wrong-password" },
      });
      fireEvent.click(screen.getByText("確認覆蓋匯入"));

      await waitFor(() =>
        expect(
          screen.getByText("密碼錯誤或備份檔已損毀，匯入已取消。")
        ).toBeInTheDocument()
      );
      expect(screen.getByText("確認匯入備份？")).toBeInTheDocument();
      expect(screen.getByLabelText("備份密碼")).toHaveValue("wrong-password");
    });

    it("取消後重新選擇檔案：密碼欄、密碼內容與錯誤訊息都會重置", async () => {
      const onImport = vi
        .fn()
        .mockResolvedValue({ ok: false, needsPassword: true });
      const { container } = render(
        <DataManagement
          onExport={vi.fn()}
          onImport={onImport}
          onClearConfirmed={vi.fn()}
        />
      );
      selectFile(container);
      fireEvent.click(screen.getByText("確認覆蓋匯入"));
      const input = await screen.findByLabelText("備份密碼");
      fireEvent.change(input, { target: { value: "leftover" } });

      fireEvent.click(screen.getByRole("button", { name: "取消" }));
      selectFile(container);

      expect(screen.queryByLabelText("備份密碼")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("import-needs-password")
      ).not.toBeInTheDocument();
    });
  });
});
