import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentDate,
  loadFinanceData,
  persistFinanceData,
  STORAGE_KEY,
} from "@/lib/storage";

vi.mock("@/lib/backup", () => ({
  downloadBackup: vi.fn(),
  downloadEncryptedBackup: vi.fn(),
  parseBackupFile: vi.fn(),
}));

import { useLocalSnapshots } from "@/hooks/useLocalSnapshots";
import {
  downloadBackup,
  downloadEncryptedBackup,
  parseBackupFile,
} from "@/lib/backup";
import { CryptoUnavailableError } from "@/lib/backupCrypto";
import { LAST_BACKUP_KEY } from "@/lib/storage";
import { createEmptySnapshot, type Debt } from "@/types/schema";

function oneDebt(principal: number): Debt {
  return {
    id: "d1",
    name: "測試負債",
    category: "信貸",
    principal,
    annualRate: 0,
    remainingMonths: 0,
    repaymentMethod: "amortizing",
    collateralValue: 0,
  };
}

/** 依「曆月差」倒推 N 個月前的日期（日固定為 01，避免月底日期在月份運算時進位造成誤差）。 */
function dateMonthsAgo(months: number): string {
  const [year, month] = getCurrentDate().split("-").map(Number);
  const total = year * 12 + (month - 1) - months;
  const resultYear = Math.floor(total / 12);
  const resultMonth = (total % 12) + 1;
  return `${resultYear}-${String(resultMonth).padStart(2, "0")}-01`;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("useLocalSnapshots", () => {
  it("無資料時，draft 為今日空白快照，且尚未存檔故為 dirty", () => {
    const { result } = renderHook(() => useLocalSnapshots());

    expect(result.current.loadStatus).toBe("empty");
    expect(result.current.draft.date).toBe(getCurrentDate());
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
      result.current.updateDraft({ debts: [oneDebt(10000)] });
    });
    act(() => {
      expect(result.current.save().ok).toBe(true);
    });

    expect(result.current.isDirty).toBe(false);
    const loaded = loadFinanceData();
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") {
      expect(loaded.data.snapshots).toHaveLength(1);
      expect(loaded.data.snapshots[0].debts[0].principal).toBe(10000);
    }
  });

  // PRD 第 9 節 #11：同日多次存檔只保留最後一次
  it("同日重複 save() 只保留最後一次結果", () => {
    const { result } = renderHook(() => useLocalSnapshots());

    act(() => {
      result.current.updateDraft({ debts: [oneDebt(1000)] });
    });
    act(() => {
      result.current.save();
    });
    act(() => {
      result.current.updateDraft({ debts: [oneDebt(5000)] });
    });
    act(() => {
      result.current.save();
    });

    const loaded = loadFinanceData();
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") {
      expect(loaded.data.snapshots).toHaveLength(1);
      expect(loaded.data.snapshots[0].debts[0].principal).toBe(5000);
    }
  });

  it("exportBackup 會呼叫 downloadBackup", () => {
    const { result } = renderHook(() => useLocalSnapshots());

    act(() => {
      result.current.exportBackup();
    });

    expect(downloadBackup).toHaveBeenCalledTimes(1);
  });

  // PRD 第 4.2 節：今日無快照時，自動帶入最近一筆快照的資料
  it("importBackup 成功時覆蓋資料，並依最新快照預帶今日表單", async () => {
    const importedData = {
      schemaVersion: 7 as const,
      snapshots: [
        {
          date: "2026-01-01",
          updatedAt: "2026-01-01T00:00:00Z",
          cashSources: [
            { id: "x", name: "匯入現金", amount: 88888, restricted: false },
          ],
          twStockValue: 0,
          usStockValue: 0,
          usStockCurrency: "USD" as const,
          exchangeRate: 0,
          realEstateValue: 0,
          debts: [],
          incomeSources: [],
          monthlyExpense: 0,
          targetNetWorth: 0,
          targetCashRatio: 0,
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
      result.current.updateDraft({ debts: [oneDebt(1000)] });
    });
    act(() => {
      result.current.save();
    });
    act(() => {
      result.current.clearAllData();
    });

    expect(result.current.loadStatus).toBe("empty");
    expect(result.current.draft.debts).toEqual([]);
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
      result.current.updateDraft({ debts: [oneDebt(1000)] });
    });

    act(() => {
      const saveResult = result.current.save();
      expect(saveResult.ok).toBe(false);
      expect(saveResult.reason).toBeTruthy();
    });

    expect(localStorage.getItem(STORAGE_KEY)).toContain('"schemaVersion":999');
  });

  // PRD 4.2 節「負債剩餘本金／期數自動估算」
  describe("負債剩餘本金／期數自動估算", () => {
    it("今日草稿依經過的月數自動遞減本息平均攤還負債的剩餘本金／期數，並標示為系統估算", () => {
      const pastDate = dateMonthsAgo(3);
      persistFinanceData({
        schemaVersion: 7,
        snapshots: [
          {
            ...createEmptySnapshot(pastDate),
            debts: [
              {
                id: "d1",
                name: "房貸",
                category: "房貸",
                principal: 3000000,
                annualRate: 2.4,
                remainingMonths: 240,
                repaymentMethod: "amortizing",
                collateralValue: 0,
              },
            ],
          },
        ],
      });

      const { result } = renderHook(() => useLocalSnapshots());

      const debt = result.current.draft.debts[0];
      expect(debt.remainingMonths).toBe(237);
      expect(debt.principal).toBeLessThan(3000000);
      expect(result.current.estimatedDebtFields.d1).toEqual({
        principal: true,
        remainingMonths: true,
      });
    });

    it("只計息負債只遞減剩餘期數，本金維持不變且不標示為估算", () => {
      const pastDate = dateMonthsAgo(2);
      persistFinanceData({
        schemaVersion: 7,
        snapshots: [
          {
            ...createEmptySnapshot(pastDate),
            debts: [
              {
                id: "d1",
                name: "股票質押",
                category: "質押",
                principal: 500000,
                annualRate: 3.5,
                remainingMonths: 12,
                repaymentMethod: "interestOnly",
                collateralValue: 0,
              },
            ],
          },
        ],
      });

      const { result } = renderHook(() => useLocalSnapshots());

      const debt = result.current.draft.debts[0];
      expect(debt.remainingMonths).toBe(10);
      expect(debt.principal).toBe(500000);
      expect(result.current.estimatedDebtFields.d1).toEqual({
        remainingMonths: true,
      });
    });

    it("使用者手動修改被估算的欄位後，該欄位的估算標示會消失", () => {
      const pastDate = dateMonthsAgo(3);
      persistFinanceData({
        schemaVersion: 7,
        snapshots: [
          {
            ...createEmptySnapshot(pastDate),
            debts: [
              {
                id: "d1",
                name: "房貸",
                category: "房貸",
                principal: 3000000,
                annualRate: 2.4,
                remainingMonths: 240,
                repaymentMethod: "amortizing",
                collateralValue: 0,
              },
            ],
          },
        ],
      });

      const { result } = renderHook(() => useLocalSnapshots());
      const estimatedPrincipal = result.current.draft.debts[0].principal;

      act(() => {
        result.current.updateDebts([
          { ...result.current.draft.debts[0], principal: 2900000 },
        ]);
      });

      expect(result.current.draft.debts[0].principal).toBe(2900000);
      expect(result.current.estimatedDebtFields.d1).toEqual({
        remainingMonths: true,
      });
      expect(estimatedPrincipal).not.toBe(2900000);
    });

    it("save() 之後清除所有估算標示（使用者已確認當下數值）", () => {
      const pastDate = dateMonthsAgo(3);
      persistFinanceData({
        schemaVersion: 7,
        snapshots: [
          {
            ...createEmptySnapshot(pastDate),
            debts: [
              {
                id: "d1",
                name: "房貸",
                category: "房貸",
                principal: 3000000,
                annualRate: 2.4,
                remainingMonths: 240,
                repaymentMethod: "amortizing",
                collateralValue: 0,
              },
            ],
          },
        ],
      });

      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.save();
      });

      expect(result.current.estimatedDebtFields).toEqual({});
    });

    it("同一曆月內建立草稿（沒有經過任何一期）時，不做遞減也不標示估算", () => {
      persistFinanceData({
        schemaVersion: 7,
        snapshots: [
          {
            ...createEmptySnapshot(dateMonthsAgo(0)),
            debts: [oneDebt(100000)],
          },
        ],
      });

      const { result } = renderHook(() => useLocalSnapshots());

      expect(result.current.draft.debts[0].principal).toBe(100000);
      expect(result.current.estimatedDebtFields).toEqual({});
    });
  });
});

// PRD 4.2「備份提醒」「加密匯出備份」「資料新鮮度提示」
describe("useLocalSnapshots：備份紀錄與加密匯出", () => {
  function saveSnapshotOn(date: string) {
    persistFinanceData({
      schemaVersion: 7,
      snapshots: [createEmptySnapshot(date)],
    });
  }

  it("從未備份過時 lastBackupAt 為 null", () => {
    const { result } = renderHook(() => useLocalSnapshots());
    expect(result.current.lastBackupAt).toBeNull();
  });

  it("載入時讀回先前記錄的上次備份時間", () => {
    localStorage.setItem(LAST_BACKUP_KEY, "2026-09-01T00:00:00.000Z");
    const { result } = renderHook(() => useLocalSnapshots());
    expect(result.current.lastBackupAt).toBe("2026-09-01T00:00:00.000Z");
  });

  // PRD 第 9 節 #46c
  it("exportBackup 成功後記錄上次備份時間，並寫入 LocalStorage", () => {
    const { result } = renderHook(() => useLocalSnapshots());

    act(() => {
      result.current.exportBackup();
    });

    expect(result.current.lastBackupAt).not.toBeNull();
    expect(localStorage.getItem(LAST_BACKUP_KEY)).toBe(
      result.current.lastBackupAt
    );
  });

  it("exportEncryptedBackup 成功：以目前資料與密碼呼叫下載，並記錄上次備份時間", async () => {
    vi.mocked(downloadEncryptedBackup).mockResolvedValue(undefined);
    saveSnapshotOn(getCurrentDate());
    const { result } = renderHook(() => useLocalSnapshots());

    let response: { ok: boolean; reason?: string } | undefined;
    await act(async () => {
      response = await result.current.exportEncryptedBackup("correct-horse");
    });

    expect(response).toEqual({ ok: true });
    expect(downloadEncryptedBackup).toHaveBeenCalledTimes(1);
    const [data, password] = vi.mocked(downloadEncryptedBackup).mock.calls[0];
    expect(password).toBe("correct-horse");
    expect(data.snapshots).toHaveLength(1);
    expect(result.current.lastBackupAt).not.toBeNull();
  });

  // PRD 第 9 節 #45h
  it("exportEncryptedBackup 遇到環境不支援時回傳原因，且不記錄上次備份時間", async () => {
    vi.mocked(downloadEncryptedBackup).mockRejectedValue(
      new CryptoUnavailableError()
    );
    const { result } = renderHook(() => useLocalSnapshots());

    let response: { ok: boolean; reason?: string } | undefined;
    await act(async () => {
      response = await result.current.exportEncryptedBackup("correct-horse");
    });

    expect(response).toEqual({
      ok: false,
      reason: "此環境不支援加密（需要 HTTPS）",
    });
    expect(result.current.lastBackupAt).toBeNull();
    expect(localStorage.getItem(LAST_BACKUP_KEY)).toBeNull();
  });

  it("exportEncryptedBackup 遇到其他錯誤時回傳通用失敗訊息，且不記錄上次備份時間", async () => {
    vi.mocked(downloadEncryptedBackup).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useLocalSnapshots());

    let response: { ok: boolean; reason?: string } | undefined;
    await act(async () => {
      response = await result.current.exportEncryptedBackup("correct-horse");
    });

    expect(response?.ok).toBe(false);
    expect(response?.reason).toBe("加密匯出失敗，請重試。");
    expect(result.current.lastBackupAt).toBeNull();
  });

  it("密碼不會被存進 LocalStorage", async () => {
    vi.mocked(downloadEncryptedBackup).mockResolvedValue(undefined);
    const { result } = renderHook(() => useLocalSnapshots());

    await act(async () => {
      await result.current.exportEncryptedBackup("super-secret-pw");
    });

    const stored = JSON.stringify({ ...localStorage });
    expect(stored).not.toContain("super-secret-pw");
  });

  // PRD 第 9 節 #46d
  it("importBackup 成功不會更新上次備份時間", async () => {
    localStorage.setItem(LAST_BACKUP_KEY, "2026-08-01T00:00:00.000Z");
    vi.mocked(parseBackupFile).mockResolvedValue({
      status: "ok",
      data: {
        schemaVersion: 7,
        snapshots: [createEmptySnapshot("2026-01-01")],
      },
    });
    const { result } = renderHook(() => useLocalSnapshots());

    await act(async () => {
      await result.current.importBackup(new File(["x"], "backup.json"));
    });

    expect(result.current.lastBackupAt).toBe("2026-08-01T00:00:00.000Z");
    expect(localStorage.getItem(LAST_BACKUP_KEY)).toBe(
      "2026-08-01T00:00:00.000Z"
    );
  });

  // PRD 第 9 節 #46e
  it("clearAllData 一併清除上次備份時間", () => {
    localStorage.setItem(LAST_BACKUP_KEY, "2026-09-01T00:00:00.000Z");
    const { result } = renderHook(() => useLocalSnapshots());

    act(() => {
      result.current.clearAllData();
    });

    expect(result.current.lastBackupAt).toBeNull();
    expect(localStorage.getItem(LAST_BACKUP_KEY)).toBeNull();
  });

  describe("importBackup：加密備份", () => {
    it("備份檔已加密且尚未提供密碼：回傳 needsPassword，不覆蓋資料", async () => {
      vi.mocked(parseBackupFile).mockResolvedValue({ status: "encrypted" });
      saveSnapshotOn("2026-01-01");
      const { result } = renderHook(() => useLocalSnapshots());

      let response:
        { ok: boolean; reason?: string; needsPassword?: boolean } | undefined;
      await act(async () => {
        response = await result.current.importBackup(new File(["x"], "b.json"));
      });

      expect(response?.ok).toBe(false);
      expect(response?.needsPassword).toBe(true);
      expect(result.current.snapshotCount).toBe(1);
    });

    it("把密碼傳給 parseBackupFile", async () => {
      vi.mocked(parseBackupFile).mockResolvedValue({
        status: "ok",
        data: {
          schemaVersion: 7,
          snapshots: [createEmptySnapshot("2026-01-01")],
        },
      });
      const { result } = renderHook(() => useLocalSnapshots());
      const file = new File(["x"], "b.json");

      let response: { ok: boolean } | undefined;
      await act(async () => {
        response = await result.current.importBackup(file, "correct-horse");
      });

      expect(parseBackupFile).toHaveBeenCalledWith(file, "correct-horse");
      expect(response?.ok).toBe(true);
    });

    it("密碼錯誤：回傳錯誤原因，不覆蓋現有資料", async () => {
      vi.mocked(parseBackupFile).mockResolvedValue({
        status: "wrong-password",
      });
      saveSnapshotOn("2026-01-01");
      const { result } = renderHook(() => useLocalSnapshots());

      let response:
        { ok: boolean; reason?: string; needsPassword?: boolean } | undefined;
      await act(async () => {
        response = await result.current.importBackup(
          new File(["x"], "b.json"),
          "wrong"
        );
      });

      expect(response?.ok).toBe(false);
      expect(response?.needsPassword).toBeUndefined();
      expect(response?.reason).toContain("密碼錯誤或備份檔已損毀");
      expect(result.current.snapshotCount).toBe(1);
    });

    it("環境不支援 WebCrypto：回傳對應原因", async () => {
      vi.mocked(parseBackupFile).mockResolvedValue({
        status: "crypto-unavailable",
      });
      const { result } = renderHook(() => useLocalSnapshots());

      let response: { ok: boolean; reason?: string } | undefined;
      await act(async () => {
        response = await result.current.importBackup(
          new File(["x"], "b.json"),
          "pw"
        );
      });

      expect(response?.ok).toBe(false);
      expect(response?.reason).toContain("此環境不支援加密");
    });
  });

  // PRD 4.2「備份提醒」「資料新鮮度提示」需要的快照日期
  describe("最早／最近一筆快照日期", () => {
    it("沒有快照時為 undefined", () => {
      const { result } = renderHook(() => useLocalSnapshots());
      expect(result.current.earliestSnapshotDate).toBeUndefined();
      expect(result.current.latestSnapshotDate).toBeUndefined();
    });

    it("依日期排序取最早與最近，與寫入順序無關", () => {
      persistFinanceData({
        schemaVersion: 7,
        snapshots: [
          createEmptySnapshot("2026-03-01"),
          createEmptySnapshot("2026-01-15"),
          createEmptySnapshot("2026-02-10"),
        ],
      });
      const { result } = renderHook(() => useLocalSnapshots());

      expect(result.current.earliestSnapshotDate).toBe("2026-01-15");
      expect(result.current.latestSnapshotDate).toBe("2026-03-01");
    });

    it("尚未存檔的今日草稿不算快照；按下存檔後 latestSnapshotDate 變為今天", () => {
      saveSnapshotOn("2026-01-01");
      const { result } = renderHook(() => useLocalSnapshots());
      expect(result.current.latestSnapshotDate).toBe("2026-01-01");

      act(() => {
        result.current.updateDraft({ monthlyExpense: 1 });
      });
      expect(result.current.latestSnapshotDate).toBe("2026-01-01");

      act(() => {
        result.current.save();
      });
      expect(result.current.latestSnapshotDate).toBe(getCurrentDate());
    });
  });
});
