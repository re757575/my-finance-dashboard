import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentMonth, loadFinanceData, STORAGE_KEY } from "@/lib/storage";

vi.mock("@/lib/backup", () => ({
  downloadBackup: vi.fn(),
  parseBackupFile: vi.fn(),
}));

import { useLocalSnapshots } from "@/hooks/useLocalSnapshots";
import { downloadBackup, parseBackupFile } from "@/lib/backup";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("useLocalSnapshots", () => {
  it("無資料時，draft 為當月空白快照，且尚未存檔故為 dirty", () => {
    const { result } = renderHook(() => useLocalSnapshots());

    expect(result.current.loadStatus).toBe("empty");
    expect(result.current.draft.month).toBe(getCurrentMonth());
    expect(result.current.draft.cashSources).toEqual([]);
    // 尚未有任何已存檔快照，此時的空白草稿仍視為未存檔（存檔按鈕應可點擊）
    expect(result.current.isDirty).toBe(true);
  });

  it("updateDraft 即時更新畫面預覽，但不寫入 LocalStorage（決策 Q10：即時預覽 + 手動存檔）", () => {
    const { result } = renderHook(() => useLocalSnapshots());

    act(() => {
      result.current.updateDraft({ twStockValue: 50000 });
    });

    expect(result.current.draft.twStockValue).toBe(50000);
    expect(result.current.metrics.totalAssets).toBe(50000);
    expect(result.current.isDirty).toBe(true);
    expect(loadFinanceData()).toEqual({ status: "empty" });
  });

  it("save() 正式寫入 LocalStorage 並清除 isDirty", () => {
    const { result } = renderHook(() => useLocalSnapshots());

    act(() => {
      result.current.updateDraft({ loan: 10000 });
    });
    act(() => {
      expect(result.current.save().ok).toBe(true);
    });

    expect(result.current.isDirty).toBe(false);
    const loaded = loadFinanceData();
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") {
      expect(loaded.data.snapshots).toHaveLength(1);
      expect(loaded.data.snapshots[0].loan).toBe(10000);
    }
  });

  // PRD 第 9 節 #11：同月多次存檔只保留最後一次
  it("同月重複 save() 只保留最後一次結果", () => {
    const { result } = renderHook(() => useLocalSnapshots());

    act(() => {
      result.current.updateDraft({ loan: 1000 });
    });
    act(() => {
      result.current.save();
    });
    act(() => {
      result.current.updateDraft({ loan: 5000 });
    });
    act(() => {
      result.current.save();
    });

    const loaded = loadFinanceData();
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") {
      expect(loaded.data.snapshots).toHaveLength(1);
      expect(loaded.data.snapshots[0].loan).toBe(5000);
    }
  });

  it("exportBackup 會呼叫 downloadBackup", () => {
    const { result } = renderHook(() => useLocalSnapshots());

    act(() => {
      result.current.exportBackup();
    });

    expect(downloadBackup).toHaveBeenCalledTimes(1);
  });

  // PRD 第 4.2 節：本月無快照時，自動帶入最近一筆快照的資料
  it("importBackup 成功時覆蓋資料，並依最新快照預帶當月表單", async () => {
    const importedData = {
      schemaVersion: 2 as const,
      snapshots: [
        {
          month: "2026-01",
          updatedAt: "2026-01-01T00:00:00Z",
          cashSources: [{ id: "x", name: "匯入現金", amount: 88888 }],
          twStockValue: 0,
          usStockValue: 0,
          usStockCurrency: "USD" as const,
          exchangeRate: 0,
          loan: 0,
          otherDebt: 0,
          cashFlow: 0,
        },
      ],
    };
    vi.mocked(parseBackupFile).mockResolvedValue({
      status: "ok",
      data: importedData,
    });

    const { result } = renderHook(() => useLocalSnapshots());
    const file = new File(["x"], "backup.json");

    await act(async () => {
      const res = await result.current.importBackup(file);
      expect(res.ok).toBe(true);
    });

    expect(result.current.draft.cashSources[0].amount).toBe(88888);
    expect(result.current.loadStatus).toBe("ok");
  });

  it("importBackup 失敗時回傳錯誤原因，不影響現有狀態", async () => {
    vi.mocked(parseBackupFile).mockResolvedValue({ status: "corrupted" });
    const { result } = renderHook(() => useLocalSnapshots());
    const file = new File(["bad"], "backup.json");

    await act(async () => {
      const res = await result.current.importBackup(file);
      expect(res.ok).toBe(false);
      expect(res.reason).toBeTruthy();
    });
  });

  it("clearAllData 清除 LocalStorage 並重置為空白狀態", () => {
    const { result } = renderHook(() => useLocalSnapshots());

    act(() => {
      result.current.updateDraft({ loan: 1000 });
    });
    act(() => {
      result.current.save();
    });
    act(() => {
      result.current.clearAllData();
    });

    expect(result.current.loadStatus).toBe("empty");
    expect(result.current.draft.loan).toBe(0);
    expect(loadFinanceData()).toEqual({ status: "empty" });
  });

  // PRD 第 6.1 節：schemaVersion 不符時拒絕存檔，避免覆蓋既有資料
  it("version-mismatch 狀態下 save() 會被拒絕，不覆蓋既有 LocalStorage 內容", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 999, snapshots: [] })
    );
    const { result } = renderHook(() => useLocalSnapshots());

    expect(result.current.loadStatus).toBe("version-mismatch");

    act(() => {
      result.current.updateDraft({ loan: 1000 });
    });

    act(() => {
      const saveResult = result.current.save();
      expect(saveResult.ok).toBe(false);
      expect(saveResult.reason).toBeTruthy();
    });

    expect(localStorage.getItem(STORAGE_KEY)).toContain('"schemaVersion":999');
  });
});
