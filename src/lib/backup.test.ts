import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultBackupFilename,
  downloadBackup,
  parseBackupFile,
} from "@/lib/backup";
import { createEmptyFinanceData } from "@/lib/storage";

describe("defaultBackupFilename", () => {
  it("格式化為 my-finance-dashboard-backup-YYYYMMDD.json", () => {
    expect(defaultBackupFilename(new Date("2026-07-11T00:00:00"))).toBe(
      "my-finance-dashboard-backup-20260711.json"
    );
  });
});

describe("downloadBackup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // PRD 第 9 節 #17：匯出的內容須與目前資料一致，且純前端觸發下載
  it("透過 Blob + <a download> 觸發下載，不經任何網路請求", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    downloadBackup(createEmptyFinanceData(), "test-backup.json");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});

describe("parseBackupFile", () => {
  // PRD 第 9 節 #18：匯入時套用與 LocalStorage 相同的驗證規則
  it("讀取合法備份檔回傳 ok", async () => {
    const data = createEmptyFinanceData();
    const file = new File([JSON.stringify(data)], "backup.json", {
      type: "application/json",
    });
    await expect(parseBackupFile(file)).resolves.toEqual({
      status: "ok",
      data,
    });
  });

  it("讀取毀損檔案回傳 corrupted，不拋錯", async () => {
    const file = new File(["not valid json"], "backup.json", {
      type: "application/json",
    });
    await expect(parseBackupFile(file)).resolves.toEqual({
      status: "corrupted",
    });
  });

  it("schemaVersion 不符回傳 version-mismatch", async () => {
    const file = new File(
      [JSON.stringify({ schemaVersion: 999, snapshots: [] })],
      "backup.json",
      {
        type: "application/json",
      }
    );
    await expect(parseBackupFile(file)).resolves.toEqual({
      status: "version-mismatch",
      foundVersion: 999,
    });
  });
});
