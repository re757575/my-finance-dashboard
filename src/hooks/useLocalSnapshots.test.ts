import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// 預設沿用真正的實作（實際載入 fixtures/finance-data.json），個別案例再覆寫回傳值模擬載入失敗
vi.mock("@/lib/demoData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demoData")>();
  return {
    ...actual,
    loadDemoFinanceData: vi.fn(actual.loadDemoFinanceData),
  };
});

import { useLocalSnapshots } from "@/hooks/useLocalSnapshots";
import {
  downloadBackup,
  downloadEncryptedBackup,
  parseBackupFile,
} from "@/lib/backup";
import { CryptoUnavailableError } from "@/lib/backupCrypto";
import { loadDemoFinanceData } from "@/lib/demoData";
import { DEMO_MODE_KEY, LAST_BACKUP_KEY } from "@/lib/storage";
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
      schemaVersion: 9 as const,
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
          recurringInvestments: [],
          targetNetWorth: 0,
          targetCashRatio: 0,
          note: "",
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
        schemaVersion: 9,
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
        schemaVersion: 9,
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
        schemaVersion: 9,
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
        schemaVersion: 9,
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
        schemaVersion: 9,
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
      schemaVersion: 9,
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
        schemaVersion: 9,
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
          schemaVersion: 9,
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
        schemaVersion: 9,
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

// PRD 4.2「歷史快照清單」「修正歷史快照」「刪除歷史快照」、第 9 節 #48～#49f
describe("useLocalSnapshots：修正與刪除歷史快照", () => {
  const TODAY = getCurrentDate();

  function snap(date: string, amount: number) {
    return {
      ...createEmptySnapshot(date),
      updatedAt: `${date}T00:00:00.000Z`,
      cashSources: [{ id: "c1", name: "銀行", amount, restricted: false }],
    };
  }

  function seed(...snapshots: ReturnType<typeof snap>[]) {
    persistFinanceData({ schemaVersion: 9, snapshots });
  }

  function storedSnapshots() {
    const loaded = loadFinanceData();
    if (loaded.status !== "ok") throw new Error("expected ok");
    return loaded.data.snapshots;
  }

  describe("進入與離開修正模式", () => {
    it("一般狀態下 editingDate 為 null", () => {
      seed(snap("2026-01-10", 100000));
      const { result } = renderHook(() => useLocalSnapshots());
      expect(result.current.editingDate).toBeNull();
    });

    // PRD 第 9 節 #48b
    it("startEditing 載入該日快照到表單，日期為該日，且尚未修改時不算 dirty", () => {
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));
      const { result } = renderHook(() => useLocalSnapshots());

      act(() => {
        result.current.startEditing("2026-01-10");
      });

      expect(result.current.editingDate).toBe("2026-01-10");
      expect(result.current.draft.date).toBe("2026-01-10");
      expect(result.current.draft.cashSources[0].amount).toBe(100000);
      expect(result.current.metrics.totalCash).toBe(100000);
      expect(result.current.isDirty).toBe(false);
    });

    it("修改欄位後 isDirty 變為 true（以被修正的日期比對已存檔快照）", () => {
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.startEditing("2026-01-10");
      });

      act(() => {
        result.current.updateDraft({ monthlyExpense: 123 });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it("找不到的日期、今天的快照都不會進入修正模式", () => {
      seed(snap("2026-01-10", 100000), snap(TODAY, 300000));
      const { result } = renderHook(() => useLocalSnapshots());

      act(() => {
        result.current.startEditing("2025-12-31");
      });
      expect(result.current.editingDate).toBeNull();

      act(() => {
        result.current.startEditing(TODAY);
      });
      expect(result.current.editingDate).toBeNull();
      expect(result.current.draft.date).toBe(TODAY);
    });

    // PRD 第 9 節 #49f
    it("版本不相容時不進入修正模式", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ schemaVersion: 999, snapshots: [] })
      );
      const { result } = renderHook(() => useLocalSnapshots());

      act(() => {
        result.current.startEditing("2026-01-10");
      });

      expect(result.current.editingDate).toBeNull();
    });

    // PRD 第 9 節 #48d
    it("取消修正：還原進入前的今日草稿（含未存檔的異動），不改動任何已存檔快照", () => {
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ monthlyExpense: 30000 });
      });
      const before = JSON.stringify(storedSnapshots());

      act(() => {
        result.current.startEditing("2026-01-10");
      });
      expect(result.current.draft.monthlyExpense).toBe(0);

      act(() => {
        result.current.cancelEditing();
      });

      expect(result.current.editingDate).toBeNull();
      expect(result.current.draft.date).toBe(TODAY);
      expect(result.current.draft.monthlyExpense).toBe(30000);
      expect(result.current.isDirty).toBe(true);
      expect(JSON.stringify(storedSnapshots())).toBe(before);
    });

    it("在非修正模式呼叫 cancelEditing 不會改動表單", () => {
      seed(snap("2026-01-10", 100000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ monthlyExpense: 777 });
      });

      act(() => {
        result.current.cancelEditing();
      });

      expect(result.current.draft.monthlyExpense).toBe(777);
    });

    // PRD 第 9 節 #48j
    it("修正中切換到另一筆：直接切換，取消後還原的仍是最初的今日草稿", () => {
      seed(
        snap("2026-01-10", 100000),
        snap("2026-02-10", 200000),
        snap("2026-03-10", 300000)
      );
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ monthlyExpense: 30000 });
      });

      act(() => {
        result.current.startEditing("2026-01-10");
      });
      act(() => {
        result.current.updateDraft({ monthlyExpense: 1 });
      });
      act(() => {
        result.current.startEditing("2026-02-10");
      });

      expect(result.current.editingDate).toBe("2026-02-10");
      expect(result.current.draft.cashSources[0].amount).toBe(200000);

      act(() => {
        result.current.cancelEditing();
      });

      expect(result.current.draft.date).toBe(TODAY);
      expect(result.current.draft.monthlyExpense).toBe(30000);
    });

    // PRD 第 9 節 #48h
    it("修正模式不做負債自動估算；離開後還原今日草稿的估算標記", () => {
      const debt = {
        id: "d1",
        name: "房貸",
        category: "房貸" as const,
        principal: 3000000,
        annualRate: 2.4,
        remainingMonths: 240,
        repaymentMethod: "amortizing" as const,
        collateralValue: 0,
      };
      seed(
        { ...snap(dateMonthsAgo(6), 100000), debts: [debt] },
        { ...snap(dateMonthsAgo(3), 200000), debts: [debt] }
      );
      const { result } = renderHook(() => useLocalSnapshots());
      // 今日草稿依經過月數自動估算，並帶有系統估算標記
      expect(Object.keys(result.current.estimatedDebtFields)).toContain("d1");
      expect(result.current.draft.debts[0].remainingMonths).toBe(237);

      act(() => {
        result.current.startEditing(dateMonthsAgo(6));
      });
      expect(result.current.estimatedDebtFields).toEqual({});
      expect(result.current.draft.debts[0].remainingMonths).toBe(240);
      expect(result.current.draft.debts[0].principal).toBe(3000000);

      act(() => {
        result.current.cancelEditing();
      });
      expect(Object.keys(result.current.estimatedDebtFields)).toContain("d1");
      expect(result.current.draft.debts[0].remainingMonths).toBe(237);
    });
  });

  describe("儲存修正", () => {
    // PRD 第 9 節 #48c
    it("只覆蓋被修正的那一天，其他日期完全不變，筆數不增加", () => {
      seed(
        snap("2026-01-10", 100000),
        snap("2026-02-10", 200000),
        snap("2026-03-10", 300000)
      );
      const { result } = renderHook(() => useLocalSnapshots());
      const untouched = [
        storedSnapshots().find((x) => x.date === "2026-01-10"),
        storedSnapshots().find((x) => x.date === "2026-03-10"),
      ];

      act(() => {
        result.current.startEditing("2026-02-10");
      });
      act(() => {
        result.current.updateDraft({
          cashSources: [
            { id: "c1", name: "銀行", amount: 999, restricted: false },
          ],
        });
      });
      let saveResult: { ok: boolean } | undefined;
      act(() => {
        saveResult = result.current.save();
      });

      expect(saveResult?.ok).toBe(true);
      const stored = storedSnapshots();
      expect(stored).toHaveLength(3);
      expect(
        stored.find((x) => x.date === "2026-02-10")?.cashSources[0].amount
      ).toBe(999);
      expect(stored.find((x) => x.date === "2026-01-10")).toEqual(untouched[0]);
      expect(stored.find((x) => x.date === "2026-03-10")).toEqual(untouched[1]);
      // 不會因此多出一筆今天的快照
      expect(stored.some((x) => x.date === TODAY)).toBe(false);
    });

    it("被修正快照的 updatedAt 更新為當下，日期不變", () => {
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.startEditing("2026-01-10");
      });
      act(() => {
        result.current.updateDraft({ monthlyExpense: 5 });
      });

      act(() => {
        result.current.save();
      });

      const saved = storedSnapshots().find((x) => x.date === "2026-01-10");
      expect(saved?.monthlyExpense).toBe(5);
      expect(saved?.updatedAt).not.toBe("2026-01-10T00:00:00.000Z");
    });

    // PRD 第 9 節 #48e
    it("儲存後離開修正模式，並還原進入前的今日草稿", () => {
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ monthlyExpense: 30000 });
      });
      act(() => {
        result.current.startEditing("2026-01-10");
      });
      act(() => {
        result.current.updateDraft({ monthlyExpense: 1 });
      });

      act(() => {
        result.current.save();
      });

      expect(result.current.editingDate).toBeNull();
      expect(result.current.draft.date).toBe(TODAY);
      expect(result.current.draft.monthlyExpense).toBe(30000);
      expect(result.current.isDirty).toBe(true);
    });

    // PRD 第 9 節 #48g：歷史計算穩定，不重算其後快照
    it("修正較早的快照不會連動其後快照的負債剩餘本金／期數", () => {
      const debt = (months: number, principal: number) => ({
        id: "d1",
        name: "房貸",
        category: "房貸" as const,
        principal,
        annualRate: 2.4,
        remainingMonths: months,
        repaymentMethod: "amortizing" as const,
        collateralValue: 0,
      });
      seed(
        { ...snap("2026-01-10", 100000), debts: [debt(240, 3000000)] },
        { ...snap("2026-02-10", 200000), debts: [debt(239, 2990000)] }
      );
      const { result } = renderHook(() => useLocalSnapshots());

      act(() => {
        result.current.startEditing("2026-01-10");
      });
      act(() => {
        result.current.updateDraft({ debts: [debt(120, 1500000)] });
      });
      act(() => {
        result.current.save();
      });

      const later = storedSnapshots().find((x) => x.date === "2026-02-10");
      expect(later?.debts[0].remainingMonths).toBe(239);
      expect(later?.debts[0].principal).toBe(2990000);
    });

    it("一般狀態下的 save 行為不變：只寫入今天", () => {
      seed(snap("2026-01-10", 100000));
      const { result } = renderHook(() => useLocalSnapshots());

      act(() => {
        result.current.save();
      });

      const stored = storedSnapshots();
      expect(stored.map((x) => x.date)).toEqual(["2026-01-10", TODAY]);
      expect(result.current.editingDate).toBeNull();
    });
  });

  describe("刪除歷史快照", () => {
    // PRD 第 9 節 #49
    it("只移除指定日期，其他日期不受影響，並寫入 LocalStorage", () => {
      seed(
        snap("2026-01-10", 100000),
        snap("2026-02-10", 200000),
        snap("2026-03-10", 300000)
      );
      const { result } = renderHook(() => useLocalSnapshots());

      let response: { ok: boolean; reason?: string } | undefined;
      act(() => {
        response = result.current.deleteSnapshot("2026-02-10");
      });

      expect(response).toEqual({ ok: true });
      expect(result.current.snapshots.map((x) => x.date)).toEqual([
        "2026-01-10",
        "2026-03-10",
      ]);
      expect(result.current.snapshotCount).toBe(2);
      expect(storedSnapshots().map((x) => x.date)).toEqual([
        "2026-01-10",
        "2026-03-10",
      ]);
    });

    it("找不到的日期回傳失敗與原因，資料不變", () => {
      seed(snap("2026-01-10", 100000));
      const { result } = renderHook(() => useLocalSnapshots());

      let response: { ok: boolean; reason?: string } | undefined;
      act(() => {
        response = result.current.deleteSnapshot("2025-01-01");
      });

      expect(response?.ok).toBe(false);
      expect(response?.reason).toContain("2025-01-01");
      expect(storedSnapshots()).toHaveLength(1);
    });

    // PRD 第 9 節 #49e
    it("不會更新上次備份時間", () => {
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));
      localStorage.setItem(LAST_BACKUP_KEY, "2026-08-01T00:00:00.000Z");
      const { result } = renderHook(() => useLocalSnapshots());

      act(() => {
        result.current.deleteSnapshot("2026-01-10");
      });

      expect(result.current.lastBackupAt).toBe("2026-08-01T00:00:00.000Z");
      expect(localStorage.getItem(LAST_BACKUP_KEY)).toBe(
        "2026-08-01T00:00:00.000Z"
      );
    });

    // PRD 第 9 節 #49f
    it("版本不相容時拒絕刪除，原始資料不被改動", () => {
      const raw = JSON.stringify({ schemaVersion: 999, snapshots: [] });
      localStorage.setItem(STORAGE_KEY, raw);
      const { result } = renderHook(() => useLocalSnapshots());

      let response: { ok: boolean; reason?: string } | undefined;
      act(() => {
        response = result.current.deleteSnapshot("2026-01-10");
      });

      expect(response?.ok).toBe(false);
      expect(response?.reason).toBeTruthy();
      expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    });

    // PRD 第 9 節 #49c
    it("刪除正在修正的那一筆：自動離開修正模式並還原今日草稿", () => {
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ monthlyExpense: 30000 });
      });
      act(() => {
        result.current.startEditing("2026-01-10");
      });

      act(() => {
        result.current.deleteSnapshot("2026-01-10");
      });

      expect(result.current.editingDate).toBeNull();
      expect(result.current.draft.date).toBe(TODAY);
      expect(result.current.draft.monthlyExpense).toBe(30000);
    });

    it("修正某一筆時刪除另一筆：仍維持在修正模式", () => {
      seed(
        snap("2026-01-10", 100000),
        snap("2026-02-10", 200000),
        snap("2026-03-10", 300000)
      );
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.startEditing("2026-01-10");
      });

      act(() => {
        result.current.deleteSnapshot("2026-03-10");
      });

      expect(result.current.editingDate).toBe("2026-01-10");
      expect(result.current.draft.date).toBe("2026-01-10");
    });

    // PRD 第 9 節 #49d
    it("刪除今天已存檔的快照：表單內容不變，但回到未存檔狀態", () => {
      seed(snap("2026-01-10", 100000), snap(TODAY, 300000));
      const { result } = renderHook(() => useLocalSnapshots());
      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.deleteSnapshot(TODAY);
      });

      expect(result.current.draft.date).toBe(TODAY);
      expect(result.current.draft.cashSources[0].amount).toBe(300000);
      expect(result.current.isDirty).toBe(true);
    });

    // PRD 第 9 節 #49b
    it("全部刪除後，快照筆數為 0，最早／最近日期為 undefined，LocalStorage 仍為合法資料", () => {
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));
      const { result } = renderHook(() => useLocalSnapshots());

      act(() => {
        result.current.deleteSnapshot("2026-01-10");
      });
      act(() => {
        result.current.deleteSnapshot("2026-02-10");
      });

      expect(result.current.snapshotCount).toBe(0);
      expect(result.current.snapshots).toEqual([]);
      expect(result.current.earliestSnapshotDate).toBeUndefined();
      expect(result.current.latestSnapshotDate).toBeUndefined();
      expect(storedSnapshots()).toEqual([]);
    });
  });

  describe("與其他操作的互動", () => {
    it("importBackup 成功後會結束修正模式，且不會再還原舊的今日草稿", async () => {
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));
      vi.mocked(parseBackupFile).mockResolvedValue({
        status: "ok",
        data: { schemaVersion: 9, snapshots: [snap("2026-05-05", 55555)] },
      });
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.startEditing("2026-01-10");
      });

      await act(async () => {
        await result.current.importBackup(new File(["x"], "backup.json"));
      });
      expect(result.current.editingDate).toBeNull();
      expect(result.current.draft.cashSources[0].amount).toBe(55555);

      // 之後即使再進入／離開修正模式，也不應復活匯入前的舊草稿
      act(() => {
        result.current.cancelEditing();
      });
      expect(result.current.draft.cashSources[0].amount).toBe(55555);
    });

    it("clearAllData 會結束修正模式並清空表單", () => {
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.startEditing("2026-01-10");
      });

      act(() => {
        result.current.clearAllData();
      });

      expect(result.current.editingDate).toBeNull();
      expect(result.current.draft.date).toBe(TODAY);
      expect(result.current.draft.cashSources).toEqual([]);
      expect(result.current.snapshots).toEqual([]);
    });
  });

  // PRD 4.2「歷史快照清單」
  it("snapshots 依日期遞增排序，與寫入順序無關，且包含全部歷史（不受趨勢圖範圍影響）", () => {
    seed(snap("2026-03-10", 3), snap("2026-01-10", 1), snap("2026-02-10", 2));
    const { result } = renderHook(() => useLocalSnapshots());

    expect(result.current.snapshots.map((x) => x.date)).toEqual([
      "2026-01-10",
      "2026-02-10",
      "2026-03-10",
    ]);
    act(() => {
      result.current.setTrendRange(7);
    });
    expect(result.current.snapshots).toHaveLength(3);
  });
});

// PRD 4.2「寫入失敗防護」「未存檔離開提醒」「多分頁資料同步」「跨日自動換日」、第 9 節 #51a～#54d
describe("useLocalSnapshots：資料安全防護", () => {
  function snap(date: string, amount: number) {
    return {
      ...createEmptySnapshot(date),
      updatedAt: `${date}T00:00:00.000Z`,
      cashSources: [{ id: "c1", name: "銀行", amount, restricted: false }],
    };
  }

  function seed(...snapshots: ReturnType<typeof snap>[]) {
    persistFinanceData({ schemaVersion: 9, snapshots });
  }

  function storedDates() {
    const loaded = loadFinanceData();
    return loaded.status === "ok"
      ? loaded.data.snapshots.map((s) => s.date)
      : [];
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("寫入失敗", () => {
    function failWrites() {
      return vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    }

    it("save 寫入失敗：回傳原因，草稿保留且維持未存檔，排除後可重試", () => {
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ twStockValue: 50000 });
      });
      const spy = failWrites();

      let response: { ok: boolean; reason?: string } | undefined;
      act(() => {
        response = result.current.save();
      });

      expect(response?.ok).toBe(false);
      expect(response?.reason).toContain("無法寫入瀏覽器儲存空間");
      expect(result.current.draft.twStockValue).toBe(50000);
      expect(result.current.isDirty).toBe(true);
      expect(result.current.hasUnsavedEdits).toBe(true);
      expect(result.current.snapshotCount).toBe(0);

      spy.mockRestore();
      act(() => {
        response = result.current.save();
      });
      expect(response?.ok).toBe(true);
      expect(result.current.isDirty).toBe(false);
      expect(storedDates()).toEqual([getCurrentDate()]);
    });

    it("儲存修正寫入失敗：仍停留在修正模式，該日快照不變", () => {
      seed(snap("2026-01-10", 100000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.startEditing("2026-01-10");
      });
      act(() => {
        result.current.updateDraft({ monthlyExpense: 999 });
      });
      failWrites();

      let response: { ok: boolean; reason?: string } | undefined;
      act(() => {
        response = result.current.save();
      });

      expect(response?.ok).toBe(false);
      expect(result.current.editingDate).toBe("2026-01-10");
      expect(result.current.draft.monthlyExpense).toBe(999);
      expect(result.current.snapshots[0].monthlyExpense).toBe(0);
    });

    it("deleteSnapshot 寫入失敗：回傳原因，快照仍在", () => {
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));
      const { result } = renderHook(() => useLocalSnapshots());
      failWrites();

      let response: { ok: boolean; reason?: string } | undefined;
      act(() => {
        response = result.current.deleteSnapshot("2026-01-10");
      });

      expect(response?.ok).toBe(false);
      expect(response?.reason).toContain("無法寫入瀏覽器儲存空間");
      expect(result.current.snapshots.map((s) => s.date)).toEqual([
        "2026-01-10",
        "2026-02-10",
      ]);
    });

    it("importBackup 寫入失敗：回傳原因，既有資料與表單不變", async () => {
      seed(snap("2026-01-10", 100000));
      vi.mocked(parseBackupFile).mockResolvedValue({
        status: "ok",
        data: { schemaVersion: 9, snapshots: [snap("2026-05-05", 55555)] },
      });
      const { result } = renderHook(() => useLocalSnapshots());
      failWrites();

      let response: { ok: boolean; reason?: string } | undefined;
      await act(async () => {
        response = await result.current.importBackup(
          new File(["x"], "backup.json")
        );
      });

      expect(response?.ok).toBe(false);
      expect(response?.reason).toContain("無法寫入瀏覽器儲存空間");
      expect(result.current.snapshots.map((s) => s.date)).toEqual([
        "2026-01-10",
      ]);
      expect(result.current.draft.cashSources[0].amount).toBe(100000);
    });

    it("exportBackup：上次備份時間寫入失敗不拋錯，備份檔照常下載", () => {
      const { result } = renderHook(() => useLocalSnapshots());
      failWrites();

      expect(() => {
        act(() => {
          result.current.exportBackup();
        });
      }).not.toThrow();
      expect(downloadBackup).toHaveBeenCalledTimes(1);
      expect(result.current.lastBackupAt).not.toBeNull();
    });

    it("瀏覽器拒絕讀取 LocalStorage：視為無資料的初始狀態，不拋錯", () => {
      seed(snap("2026-01-10", 100000));
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new DOMException("access denied", "SecurityError");
      });

      const { result } = renderHook(() => useLocalSnapshots());

      expect(result.current.loadStatus).toBe("empty");
      expect(result.current.snapshotCount).toBe(0);
      expect(result.current.lastBackupAt).toBeNull();
    });
  });

  describe("未存檔離開提醒", () => {
    /** 模擬離開頁面，回傳瀏覽器是否會跳出確認（事件被 preventDefault）。 */
    function leavePagePrompts() {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }

    it("系統帶入、使用者沒動過的今日草稿：雖未存檔但不提醒", () => {
      seed(snap("2026-01-10", 100000));
      const { result } = renderHook(() => useLocalSnapshots());

      expect(result.current.isDirty).toBe(true);
      expect(result.current.hasUnsavedEdits).toBe(false);
      expect(leavePagePrompts()).toBe(false);
    });

    it("全新使用者的空白表單不提醒", () => {
      const { result } = renderHook(() => useLocalSnapshots());

      expect(result.current.hasUnsavedEdits).toBe(false);
      expect(leavePagePrompts()).toBe(false);
    });

    it("手動編輯後提醒；改回原值後不再提醒", () => {
      const { result } = renderHook(() => useLocalSnapshots());

      act(() => {
        result.current.updateDraft({ twStockValue: 50000 });
      });
      expect(result.current.hasUnsavedEdits).toBe(true);
      expect(leavePagePrompts()).toBe(true);

      act(() => {
        result.current.updateDraft({ twStockValue: 0 });
      });
      expect(result.current.hasUnsavedEdits).toBe(false);
      expect(leavePagePrompts()).toBe(false);
    });

    it("存檔成功後不再提醒", () => {
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ twStockValue: 50000 });
      });

      act(() => {
        result.current.save();
      });

      expect(result.current.hasUnsavedEdits).toBe(false);
      expect(leavePagePrompts()).toBe(false);
    });

    it("修正模式：暫存的今日草稿有未存檔編輯時仍提醒，取消修正後也是", () => {
      seed(snap("2026-01-10", 100000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ monthlyExpense: 30000 });
      });

      act(() => {
        result.current.startEditing("2026-01-10");
      });
      expect(result.current.isDirty).toBe(false);
      expect(result.current.hasUnsavedEdits).toBe(true);
      expect(leavePagePrompts()).toBe(true);

      act(() => {
        result.current.cancelEditing();
      });
      expect(result.current.draft.monthlyExpense).toBe(30000);
      expect(result.current.hasUnsavedEdits).toBe(true);
    });

    it("修正模式：修改被修正的快照會提醒，儲存修正後不再提醒", () => {
      seed(snap("2026-01-10", 100000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.startEditing("2026-01-10");
      });
      expect(result.current.hasUnsavedEdits).toBe(false);

      act(() => {
        result.current.updateDraft({ monthlyExpense: 999 });
      });
      expect(result.current.hasUnsavedEdits).toBe(true);
      expect(leavePagePrompts()).toBe(true);

      act(() => {
        result.current.save();
      });
      expect(result.current.hasUnsavedEdits).toBe(false);
      expect(leavePagePrompts()).toBe(false);
    });

    it("匯入還原與清空資料後不再提醒", async () => {
      vi.mocked(parseBackupFile).mockResolvedValue({
        status: "ok",
        data: { schemaVersion: 9, snapshots: [snap("2026-05-05", 55555)] },
      });
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ twStockValue: 50000 });
      });

      await act(async () => {
        await result.current.importBackup(new File(["x"], "backup.json"));
      });
      expect(result.current.hasUnsavedEdits).toBe(false);

      act(() => {
        result.current.updateDraft({ twStockValue: 1 });
      });
      act(() => {
        result.current.clearAllData();
      });
      expect(result.current.hasUnsavedEdits).toBe(false);
    });
  });

  describe("多分頁資料同步", () => {
    const TODAY = getCurrentDate();

    /** 模擬另一個分頁寫入 LocalStorage：本分頁只會收到 storage 事件。 */
    function otherTabWrites(key: string, value: string | null) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", { key, storageArea: localStorage })
        );
      });
    }

    function otherTabSaves(...snapshots: ReturnType<typeof snap>[]) {
      otherTabWrites(
        STORAGE_KEY,
        JSON.stringify({ schemaVersion: 9, snapshots })
      );
    }

    it("沒有未存檔編輯：另一分頁存檔今天後，已存檔資料與表單一併更新", () => {
      seed(snap("2026-01-10", 100000));
      const { result } = renderHook(() => useLocalSnapshots());

      otherTabSaves(snap("2026-01-10", 100000), snap(TODAY, 777));

      expect(result.current.snapshots.map((s) => s.date)).toEqual([
        "2026-01-10",
        TODAY,
      ]);
      expect(result.current.draft.cashSources[0].amount).toBe(777);
      expect(result.current.isDirty).toBe(false);
      expect(result.current.hasUnsavedEdits).toBe(false);
    });

    it("有未存檔編輯：保留編輯內容，存檔只覆蓋今天，不會把另一分頁刪除的快照寫回來", () => {
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ monthlyExpense: 30000 });
      });

      // 另一分頁刪除 01-10、修正 02-10
      otherTabSaves(snap("2026-02-10", 222222));

      expect(result.current.draft.monthlyExpense).toBe(30000);
      expect(result.current.hasUnsavedEdits).toBe(true);
      expect(result.current.snapshots.map((s) => s.date)).toEqual([
        "2026-02-10",
      ]);

      act(() => {
        result.current.save();
      });
      expect(storedDates()).toEqual(["2026-02-10", TODAY]);
      expect(result.current.snapshots[0].cashSources[0].amount).toBe(222222);
    });

    it("修正模式：被修正的快照在另一分頁被刪除時，自動離開修正模式並還原今日草稿", () => {
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ monthlyExpense: 30000 });
      });
      act(() => {
        result.current.startEditing("2026-01-10");
      });

      otherTabSaves(snap("2026-02-10", 200000));

      expect(result.current.editingDate).toBeNull();
      expect(result.current.draft.date).toBe(TODAY);
      expect(result.current.draft.monthlyExpense).toBe(30000);
    });

    it("修正模式：被修正的快照仍在且尚未修改時，載入另一分頁的最新內容", () => {
      seed(snap("2026-01-10", 100000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.startEditing("2026-01-10");
      });

      otherTabSaves(snap("2026-01-10", 123456));

      expect(result.current.editingDate).toBe("2026-01-10");
      expect(result.current.draft.cashSources[0].amount).toBe(123456);
      expect(result.current.isDirty).toBe(false);
    });

    it("另一分頁清空資料：沒有未存檔編輯時表單回到空白", () => {
      seed(snap("2026-01-10", 100000));
      const { result } = renderHook(() => useLocalSnapshots());

      otherTabWrites(STORAGE_KEY, null);

      expect(result.current.loadStatus).toBe("empty");
      expect(result.current.snapshotCount).toBe(0);
      expect(result.current.draft.cashSources).toEqual([]);
    });

    it("另一分頁寫入版本不相容的資料：暫停存檔，不覆蓋該資料", () => {
      seed(snap("2026-01-10", 100000));
      const { result } = renderHook(() => useLocalSnapshots());
      const raw = JSON.stringify({ schemaVersion: 999, snapshots: [] });

      otherTabWrites(STORAGE_KEY, raw);

      expect(result.current.loadStatus).toBe("version-mismatch");
      let response: { ok: boolean; reason?: string } | undefined;
      act(() => {
        response = result.current.save();
      });
      expect(response?.ok).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    });

    it("另一分頁匯出備份：同步上次備份時間", () => {
      const { result } = renderHook(() => useLocalSnapshots());
      expect(result.current.lastBackupAt).toBeNull();

      otherTabWrites(LAST_BACKUP_KEY, "2026-09-30T08:30:00.000Z");

      expect(result.current.lastBackupAt).toBe("2026-09-30T08:30:00.000Z");
    });

    it("無關的鍵不會觸發重新讀取", () => {
      seed(snap("2026-01-10", 100000));
      const { result } = renderHook(() => useLocalSnapshots());
      // 繞過 storage 事件直接改動資料，確認無關的鍵不會讓 hook 重新讀取
      seed(snap("2026-01-10", 100000), snap("2026-02-10", 200000));

      otherTabWrites("some_other_key", "x");

      expect(result.current.snapshotCount).toBe(1);
    });
  });

  describe("跨日自動換日", () => {
    function setToday(date: string) {
      vi.setSystemTime(new Date(`${date}T10:00:00`));
    }

    /** 模擬使用者切回這個分頁。 */
    function returnToPage() {
      act(() => {
        window.dispatchEvent(new Event("focus"));
      });
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      setToday("2026-10-01");
    });

    it("未跨日時回到前景不會改動任何內容", () => {
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ twStockValue: 50000 });
      });
      const before = result.current.draft;

      returnToPage();

      expect(result.current.currentDate).toBe("2026-10-01");
      expect(result.current.draft).toBe(before);
    });

    it("沒有任何前景事件就跨日：存檔仍寫入實際存檔當天，前一天的快照不變", () => {
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ twStockValue: 10000 });
      });
      act(() => {
        result.current.save();
      });
      expect(storedDates()).toEqual(["2026-10-01"]);

      setToday("2026-10-02");
      act(() => {
        result.current.updateDraft({ twStockValue: 20000 });
      });
      act(() => {
        result.current.save();
      });

      expect(storedDates()).toEqual(["2026-10-01", "2026-10-02"]);
      expect(result.current.snapshots.map((s) => s.twStockValue)).toEqual([
        10000, 20000,
      ]);
      expect(result.current.currentDate).toBe("2026-10-02");
      expect(result.current.draft.date).toBe("2026-10-02");
      expect(result.current.isDirty).toBe(false);
    });

    it("回到前景時換日：沒有未存檔編輯就重新帶入最近一筆，跨月時負債自動估算", () => {
      setToday("2026-09-30");
      persistFinanceData({
        schemaVersion: 9,
        snapshots: [
          {
            ...createEmptySnapshot("2026-09-15"),
            debts: [
              {
                ...oneDebt(100000),
                repaymentMethod: "interestOnly",
                remainingMonths: 12,
              },
            ],
          },
        ],
      });
      const { result } = renderHook(() => useLocalSnapshots());
      expect(result.current.draft.debts[0].remainingMonths).toBe(12);

      setToday("2026-10-01");
      returnToPage();

      expect(result.current.currentDate).toBe("2026-10-01");
      expect(result.current.draft.date).toBe("2026-10-01");
      expect(result.current.draft.debts[0].remainingMonths).toBe(11);
      expect(result.current.estimatedDebtFields).toEqual({
        d1: { remainingMonths: true },
      });
      expect(result.current.hasUnsavedEdits).toBe(false);
    });

    it("visibilitychange 也會觸發換日", () => {
      const { result } = renderHook(() => useLocalSnapshots());

      setToday("2026-10-02");
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(result.current.currentDate).toBe("2026-10-02");
    });

    it("回到前景時換日：有未存檔編輯就保留內容，成為新一天的草稿", () => {
      seed(snap("2026-09-20", 100000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ monthlyExpense: 30000 });
      });

      setToday("2026-10-02");
      returnToPage();

      expect(result.current.currentDate).toBe("2026-10-02");
      expect(result.current.draft.date).toBe("2026-10-02");
      expect(result.current.draft.monthlyExpense).toBe(30000);
      expect(result.current.hasUnsavedEdits).toBe(true);

      act(() => {
        result.current.save();
      });
      expect(storedDates()).toEqual(["2026-09-20", "2026-10-02"]);
    });

    it("已存檔當天的快照後跨日：新一天的草稿沿用前一天數值，且為未存檔", () => {
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ twStockValue: 10000 });
      });
      act(() => {
        result.current.save();
      });

      setToday("2026-10-02");
      returnToPage();

      expect(result.current.draft.date).toBe("2026-10-02");
      expect(result.current.draft.twStockValue).toBe(10000);
      expect(result.current.isDirty).toBe(true);
      expect(result.current.latestSnapshotDate).toBe("2026-10-01");
    });

    it("修正模式中跨日：仍在修正原本那一天，儲存修正後還原的今日草稿為新的一天", () => {
      seed(snap("2026-09-20", 100000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ monthlyExpense: 30000 });
      });
      act(() => {
        result.current.startEditing("2026-09-20");
      });
      act(() => {
        result.current.updateDraft({ monthlyExpense: 999 });
      });

      setToday("2026-10-02");
      returnToPage();

      expect(result.current.editingDate).toBe("2026-09-20");
      expect(result.current.draft.date).toBe("2026-09-20");
      expect(result.current.draft.monthlyExpense).toBe(999);

      act(() => {
        result.current.save();
      });
      expect(storedDates()).toEqual(["2026-09-20"]);
      expect(result.current.editingDate).toBeNull();
      expect(result.current.draft.date).toBe("2026-10-02");
      expect(result.current.draft.monthlyExpense).toBe(30000);
    });

    it("趨勢圖範圍以換日後的今天為基準", () => {
      seed(snap("2026-09-25", 1), snap("2026-10-01", 2));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.setTrendRange(7);
      });
      expect(result.current.visibleSnapshots.map((s) => s.date)).toEqual([
        "2026-09-25",
        "2026-10-01",
      ]);

      setToday("2026-10-02");
      returnToPage();

      expect(result.current.visibleSnapshots.map((s) => s.date)).toEqual([
        "2026-10-01",
      ]);
    });
  });
});

// PRD 4.2「趨勢圖範圍選項」、5.4 節、第 9 節 #57a～#57f
describe("useLocalSnapshots：趨勢圖範圍", () => {
  function snap(date: string, amount: number) {
    return {
      ...createEmptySnapshot(date),
      updatedAt: `${date}T00:00:00.000Z`,
      cashSources: [{ id: "c1", name: "銀行", amount, restricted: false }],
    };
  }

  function seed(...snapshots: ReturnType<typeof snap>[]) {
    persistFinanceData({ schemaVersion: 9, snapshots });
  }

  function setToday(date: string) {
    vi.setSystemTime(new Date(`${date}T10:00:00`));
  }

  /** 模擬使用者切回這個分頁。 */
  function returnToPage() {
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
  }

  function visibleDates(result: {
    current: ReturnType<typeof useLocalSnapshots>;
  }) {
    return result.current.visibleSnapshots.map((s) => s.date);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    setToday("2026-10-03");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("預設範圍為 90 天", () => {
    // 2026-10-03 往前 89 天是 2026-07-06
    seed(snap("2026-07-05", 1), snap("2026-07-06", 2), snap("2026-10-03", 3));
    const { result } = renderHook(() => useLocalSnapshots());

    expect(result.current.trendRange).toBe(90);
    expect(visibleDates(result)).toEqual(["2026-07-06", "2026-10-03"]);
  });

  it("1 年：只納入最近 365 天（含今天）的快照", () => {
    seed(snap("2025-10-03", 1), snap("2025-10-04", 2), snap("2026-10-03", 3));
    const { result } = renderHook(() => useLocalSnapshots());
    act(() => {
      result.current.setTrendRange(365);
    });

    expect(visibleDates(result)).toEqual(["2025-10-04", "2026-10-03"]);
  });

  it("今年以來：納入今年 1/1（含）之後的快照，前一年 12/31 不納入", () => {
    seed(snap("2025-12-31", 1), snap("2026-01-01", 2), snap("2026-09-30", 3));
    const { result } = renderHook(() => useLocalSnapshots());
    act(() => {
      result.current.setTrendRange("ytd");
    });

    expect(visibleDates(result)).toEqual(["2026-01-01", "2026-09-30"]);
  });

  it("今年以來：跨年換日後改以新年度的 1/1 起算，已存檔資料不變", () => {
    setToday("2026-12-31");
    seed(snap("2026-06-30", 1), snap("2026-12-31", 2));
    const { result } = renderHook(() => useLocalSnapshots());
    act(() => {
      result.current.setTrendRange("ytd");
    });
    expect(visibleDates(result)).toEqual(["2026-06-30", "2026-12-31"]);

    setToday("2027-01-01");
    returnToPage();

    expect(result.current.currentDate).toBe("2027-01-01");
    expect(visibleDates(result)).toEqual([]);
    expect(result.current.snapshots.map((s) => s.date)).toEqual([
      "2026-06-30",
      "2026-12-31",
    ]);

    // 新年度存檔後，只有新年度的快照落在「今年以來」
    act(() => {
      result.current.save();
    });
    expect(visibleDates(result)).toEqual(["2027-01-01"]);
    expect(result.current.snapshotCount).toBe(3);
  });

  it("切換範圍只影響 visibleSnapshots，snapshots 永遠是全部歷史", () => {
    seed(
      snap("2024-05-01", 1),
      snap("2025-12-31", 2),
      snap("2026-01-01", 3),
      snap("2026-10-03", 4)
    );
    const { result } = renderHook(() => useLocalSnapshots());

    act(() => {
      result.current.setTrendRange(365);
    });
    expect(visibleDates(result)).toEqual([
      "2025-12-31",
      "2026-01-01",
      "2026-10-03",
    ]);

    act(() => {
      result.current.setTrendRange("ytd");
    });
    expect(visibleDates(result)).toEqual(["2026-01-01", "2026-10-03"]);

    act(() => {
      result.current.setTrendRange("all");
    });
    expect(visibleDates(result)).toHaveLength(4);
    expect(result.current.snapshots).toHaveLength(4);
  });
});

// PRD 4.2「範例資料」、6.2 節、第 9 節 #63a～#63m
describe("useLocalSnapshots：範例資料", () => {
  const TODAY = "2026-10-06";
  /** fixtures/finance-data.json 的快照筆數。 */
  const DEMO_COUNT = 60;

  type Hook = { current: ReturnType<typeof useLocalSnapshots> };

  function snap(date: string, amount: number) {
    return {
      ...createEmptySnapshot(date),
      updatedAt: `${date}T00:00:00.000Z`,
      cashSources: [{ id: "c1", name: "銀行", amount, restricted: false }],
    };
  }

  function seed(...snapshots: ReturnType<typeof snap>[]) {
    persistFinanceData({ schemaVersion: 9, snapshots });
  }

  function storedDates() {
    const loaded = loadFinanceData();
    return loaded.status === "ok"
      ? loaded.data.snapshots.map((s) => s.date)
      : [];
  }

  function demoFlag() {
    return localStorage.getItem(DEMO_MODE_KEY);
  }

  async function loadDemo(result: Hook) {
    let response: { ok: boolean; reason?: string } | undefined;
    await act(async () => {
      response = await result.current.loadDemoData();
    });
    return response!;
  }

  /** 模擬另一個分頁寫入 LocalStorage：本分頁只會收到 storage 事件。 */
  function otherTabWrites(key: string, value: string | null) {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key, storageArea: localStorage })
      );
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("是否提供範例資料", () => {
    // #63a
    it("全新使用者：提供範例資料，且不是範例模式", () => {
      const { result } = renderHook(() => useLocalSnapshots());

      expect(result.current.canLoadDemo).toBe(true);
      expect(result.current.isDemo).toBe(false);
    });

    // #63h
    it("已有快照：不提供", () => {
      seed(snap("2026-09-01", 1000));
      const { result } = renderHook(() => useLocalSnapshots());

      expect(result.current.canLoadDemo).toBe(false);
      expect(result.current.isDemo).toBe(false);
    });

    // #63i
    it("版本不相容：不提供，避免覆蓋既有資料", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ schemaVersion: 999, snapshots: [] })
      );
      const { result } = renderHook(() => useLocalSnapshots());

      expect(result.current.loadStatus).toBe("version-mismatch");
      expect(result.current.canLoadDemo).toBe(false);
    });

    it("資料毀損已重置：提供", () => {
      localStorage.setItem(STORAGE_KEY, "{bad json");
      const { result } = renderHook(() => useLocalSnapshots());

      expect(result.current.loadStatus).toBe("corrupted");
      expect(result.current.canLoadDemo).toBe(true);
    });

    it("存下第一筆快照後不再提供，且不會被當成範例資料", () => {
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ twStockValue: 50000 });
      });
      act(() => {
        result.current.save();
      });

      expect(result.current.canLoadDemo).toBe(false);
      expect(result.current.isDemo).toBe(false);
      expect(demoFlag()).toBeNull();
    });

    it("清空資料後重新提供", () => {
      seed(snap("2026-09-01", 1000));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.clearAllData();
      });

      expect(result.current.canLoadDemo).toBe(true);
    });
  });

  describe("載入範例資料", () => {
    // #63b
    it("成功：寫入全部範例快照與範例模式標記，進入範例模式", async () => {
      const { result } = renderHook(() => useLocalSnapshots());

      const response = await loadDemo(result);

      expect(response).toEqual({ ok: true });
      expect(result.current.isDemo).toBe(true);
      expect(result.current.canLoadDemo).toBe(false);
      expect(result.current.loadStatus).toBe("ok");
      expect(result.current.snapshotCount).toBe(DEMO_COUNT);
      expect(storedDates()).toHaveLength(DEMO_COUNT);
      expect(demoFlag()).toBe("1");
    });

    // #63c
    it("日期已平移：最新一筆落在今天，前一筆為 2026-09-06", async () => {
      const { result } = renderHook(() => useLocalSnapshots());

      await loadDemo(result);

      expect(result.current.latestSnapshotDate).toBe(TODAY);
      expect(result.current.snapshots.at(-2)?.date).toBe("2026-09-06");
      expect(storedDates().sort().at(-1)).toBe(TODAY);
    });

    it("表單帶入今天的範例快照，視為已存檔且沒有未存檔編輯", async () => {
      const { result } = renderHook(() => useLocalSnapshots());

      await loadDemo(result);

      expect(result.current.draft.date).toBe(TODAY);
      expect(result.current.draft.twStockValue).toBeGreaterThan(0);
      expect(result.current.draft.cashSources.length).toBeGreaterThan(0);
      expect(result.current.isDirty).toBe(false);
      expect(result.current.hasUnsavedEdits).toBe(false);
      expect(result.current.estimatedDebtFields).toEqual({});
      expect(result.current.metrics.totalAssets).toBeGreaterThan(0);
    });

    it("會取代表單上尚未存檔的內容", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ twStockValue: 123 });
      });
      expect(result.current.hasUnsavedEdits).toBe(true);

      await loadDemo(result);

      expect(result.current.draft.twStockValue).not.toBe(123);
      expect(result.current.hasUnsavedEdits).toBe(false);
    });

    it("趨勢圖範圍切換為 1 年，涵蓋最近 12 筆每月快照", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      expect(result.current.trendRange).toBe(90);

      await loadDemo(result);

      expect(result.current.trendRange).toBe(365);
      expect(result.current.visibleSnapshots).toHaveLength(12);
      // 全部歷史不受範圍影響
      expect(result.current.snapshots).toHaveLength(DEMO_COUNT);
    });

    it("不更新上次備份時間", async () => {
      const { result } = renderHook(() => useLocalSnapshots());

      await loadDemo(result);

      expect(result.current.lastBackupAt).toBeNull();
      expect(localStorage.getItem(LAST_BACKUP_KEY)).toBeNull();
    });

    it("資料毀損已重置的狀態下可以載入，狀態變為 ok", async () => {
      localStorage.setItem(STORAGE_KEY, "{bad json");
      const { result } = renderHook(() => useLocalSnapshots());

      const response = await loadDemo(result);

      expect(response.ok).toBe(true);
      expect(result.current.loadStatus).toBe("ok");
      expect(result.current.isDemo).toBe(true);
    });

    // #63d
    it("重新整理頁面後仍為範例模式；趨勢圖範圍回到預設 90 天", async () => {
      const first = renderHook(() => useLocalSnapshots());
      await loadDemo(first.result);
      first.unmount();

      const { result } = renderHook(() => useLocalSnapshots());

      expect(result.current.isDemo).toBe(true);
      expect(result.current.canLoadDemo).toBe(false);
      expect(result.current.snapshotCount).toBe(DEMO_COUNT);
      expect(result.current.trendRange).toBe(90);
    });

    it("頁面開著跨日後才載入：以實際當天為準", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      vi.setSystemTime(new Date("2026-10-08T09:00:00"));

      await loadDemo(result);

      expect(result.current.currentDate).toBe("2026-10-08");
      expect(result.current.latestSnapshotDate).toBe("2026-10-08");
      expect(result.current.draft.date).toBe("2026-10-08");
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe("絕不覆蓋既有資料", () => {
    // #63h：本分頁仍顯示邀請卡，但另一分頁已先存檔（尚未收到 storage 事件）
    it("LocalStorage 已有快照：拒絕載入，既有快照不變", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      seed(snap("2026-09-01", 4321));
      const before = localStorage.getItem(STORAGE_KEY);

      const response = await loadDemo(result);

      expect(response.ok).toBe(false);
      expect(response.reason).toContain("已有資料");
      expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
      expect(demoFlag()).toBeNull();
      expect(result.current.isDemo).toBe(false);
      expect(result.current.snapshotCount).toBe(0);
      expect(result.current.trendRange).toBe(90);
    });

    // #63i
    it("LocalStorage 為版本不相容的資料：拒絕載入，原始內容不變", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      const raw = JSON.stringify({ schemaVersion: 999, snapshots: [] });
      localStorage.setItem(STORAGE_KEY, raw);

      const response = await loadDemo(result);

      expect(response.ok).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
      expect(demoFlag()).toBeNull();
      expect(result.current.isDemo).toBe(false);
    });

    it("範例檔載入失敗：回傳原因，不寫入任何資料", async () => {
      vi.mocked(loadDemoFinanceData).mockResolvedValueOnce(null);
      const { result } = renderHook(() => useLocalSnapshots());

      const response = await loadDemo(result);

      expect(response.ok).toBe(false);
      expect(response.reason).toContain("範例資料載入失敗");
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(demoFlag()).toBeNull();
      expect(result.current.isDemo).toBe(false);
      expect(result.current.canLoadDemo).toBe(true);
    });
  });

  // #63k
  describe("寫入失敗", () => {
    it("儲存空間無法寫入：回傳原因，仍為無資料狀態，不殘留範例模式標記", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });

      const response = await loadDemo(result);

      expect(response.ok).toBe(false);
      expect(response.reason).toContain("無法寫入瀏覽器儲存空間");
      expect(result.current.isDemo).toBe(false);
      expect(result.current.canLoadDemo).toBe(true);
      expect(result.current.snapshotCount).toBe(0);
      vi.restoreAllMocks();
      expect(demoFlag()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("標記寫入成功但快照寫入失敗：收回標記", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      const original = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage,
        key: string,
        value: string
      ) {
        if (key === STORAGE_KEY) {
          throw new DOMException("quota exceeded", "QuotaExceededError");
        }
        original.call(this, key, value);
      });

      const response = await loadDemo(result);

      expect(response.ok).toBe(false);
      expect(demoFlag()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(result.current.isDemo).toBe(false);
    });

    it("排除問題後可重試成功", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      const spy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new DOMException("quota exceeded", "QuotaExceededError");
        });
      expect((await loadDemo(result)).ok).toBe(false);

      spy.mockRestore();
      const response = await loadDemo(result);

      expect(response.ok).toBe(true);
      expect(result.current.isDemo).toBe(true);
      expect(demoFlag()).toBe("1");
    });
  });

  // #63e
  describe("範例模式下可正常操作", () => {
    it("修改後存檔：寫入今天，仍為範例模式", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      await loadDemo(result);

      act(() => {
        result.current.updateDraft({ twStockValue: 5000000 });
      });
      expect(result.current.isDirty).toBe(true);
      let response: { ok: boolean } | undefined;
      act(() => {
        response = result.current.save();
      });

      expect(response?.ok).toBe(true);
      expect(result.current.isDirty).toBe(false);
      expect(result.current.snapshotCount).toBe(DEMO_COUNT);
      expect(result.current.snapshots.at(-1)?.twStockValue).toBe(5000000);
      expect(result.current.isDemo).toBe(true);
      expect(demoFlag()).toBe("1");
    });

    it("修正與刪除歷史快照照常運作，仍為範例模式", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      await loadDemo(result);

      act(() => {
        result.current.startEditing("2026-09-06");
      });
      expect(result.current.editingDate).toBe("2026-09-06");
      act(() => {
        result.current.updateDraft({ twStockValue: 1 });
      });
      act(() => {
        result.current.save();
      });
      expect(result.current.editingDate).toBeNull();
      expect(
        result.current.snapshots.find((s) => s.date === "2026-09-06")
          ?.twStockValue
      ).toBe(1);

      act(() => {
        result.current.deleteSnapshot("2026-09-06");
      });

      expect(result.current.snapshotCount).toBe(DEMO_COUNT - 1);
      expect(result.current.isDemo).toBe(true);
      expect(demoFlag()).toBe("1");
    });
  });

  describe("結束範例模式", () => {
    // #63f
    it("clearAllData：清除全部快照、上次備份時間與範例模式標記，不觸發匯出", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      await loadDemo(result);
      act(() => {
        result.current.exportBackup();
      });
      expect(result.current.lastBackupAt).not.toBeNull();
      vi.mocked(downloadBackup).mockClear();

      act(() => {
        result.current.clearAllData();
      });

      expect(downloadBackup).not.toHaveBeenCalled();
      expect(result.current.isDemo).toBe(false);
      expect(result.current.canLoadDemo).toBe(true);
      expect(result.current.snapshotCount).toBe(0);
      expect(result.current.draft).toMatchObject({
        date: TODAY,
        cashSources: [],
        twStockValue: 0,
      });
      expect(result.current.lastBackupAt).toBeNull();
      expect(demoFlag()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(LAST_BACKUP_KEY)).toBeNull();
    });

    it("清除後可再次載入範例資料", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      await loadDemo(result);
      act(() => {
        result.current.clearAllData();
      });

      const response = await loadDemo(result);

      expect(response.ok).toBe(true);
      expect(result.current.isDemo).toBe(true);
      expect(result.current.snapshotCount).toBe(DEMO_COUNT);
    });

    // #63j
    it("importBackup 成功：換成匯入的資料，結束範例模式並移除標記", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      await loadDemo(result);
      vi.mocked(parseBackupFile).mockResolvedValue({
        status: "ok",
        data: { schemaVersion: 9, snapshots: [snap("2026-01-01", 88888)] },
      });

      await act(async () => {
        await result.current.importBackup(new File(["x"], "backup.json"));
      });

      expect(result.current.isDemo).toBe(false);
      expect(demoFlag()).toBeNull();
      expect(result.current.snapshotCount).toBe(1);
      expect(result.current.draft.cashSources[0].amount).toBe(88888);
    });

    it("importBackup 失敗：仍為範例模式，範例資料不變", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      await loadDemo(result);
      vi.mocked(parseBackupFile).mockResolvedValue({ status: "corrupted" });

      await act(async () => {
        await result.current.importBackup(new File(["x"], "backup.json"));
      });

      expect(result.current.isDemo).toBe(true);
      expect(demoFlag()).toBe("1");
      expect(result.current.snapshotCount).toBe(DEMO_COUNT);
    });

    // #63m
    it("範例快照被逐筆刪光：不再是範例模式；之後存檔的資料視為使用者自己的", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      await loadDemo(result);

      for (const date of result.current.snapshots.map((s) => s.date)) {
        act(() => {
          result.current.deleteSnapshot(date);
        });
      }
      expect(result.current.snapshotCount).toBe(0);
      expect(result.current.isDemo).toBe(false);
      expect(result.current.canLoadDemo).toBe(true);

      act(() => {
        result.current.updateDraft({ twStockValue: 777 });
      });
      act(() => {
        result.current.save();
      });

      expect(result.current.snapshotCount).toBe(1);
      expect(result.current.isDemo).toBe(false);
      expect(demoFlag()).toBeNull();
    });

    it("殘留的標記（有標記但沒有快照）不算範例模式，存檔時一併清除", () => {
      localStorage.setItem(DEMO_MODE_KEY, "1");
      const { result } = renderHook(() => useLocalSnapshots());

      expect(result.current.isDemo).toBe(false);
      expect(result.current.canLoadDemo).toBe(true);

      act(() => {
        result.current.updateDraft({ twStockValue: 777 });
      });
      act(() => {
        result.current.save();
      });

      expect(result.current.isDemo).toBe(false);
      expect(demoFlag()).toBeNull();
    });
  });

  // #63l
  describe("多分頁", () => {
    it("另一分頁載入範例資料：本分頁同步快照並進入範例模式", () => {
      const { result } = renderHook(() => useLocalSnapshots());

      // 與 loadDemoData 的寫入順序相同：先標記、後資料
      otherTabWrites(DEMO_MODE_KEY, "1");
      expect(result.current.isDemo).toBe(false);
      otherTabWrites(
        STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 9,
          snapshots: [snap("2026-09-06", 100), snap(TODAY, 200)],
        })
      );

      expect(result.current.isDemo).toBe(true);
      expect(result.current.canLoadDemo).toBe(false);
      expect(result.current.snapshotCount).toBe(2);
      expect(result.current.draft.cashSources[0].amount).toBe(200);
    });

    it("另一分頁清除範例資料：本分頁回到無資料狀態並重新提供範例資料", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      await loadDemo(result);

      otherTabWrites(STORAGE_KEY, null);
      otherTabWrites(DEMO_MODE_KEY, null);

      expect(result.current.isDemo).toBe(false);
      expect(result.current.canLoadDemo).toBe(true);
      expect(result.current.snapshotCount).toBe(0);
      expect(result.current.draft.cashSources).toEqual([]);
    });

    it("另一分頁匯入自己的備份（只移除標記）：本分頁結束範例模式，資料仍在", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      await loadDemo(result);

      otherTabWrites(DEMO_MODE_KEY, null);

      expect(result.current.isDemo).toBe(false);
      expect(result.current.snapshotCount).toBe(DEMO_COUNT);
    });

    it("整個 LocalStorage 被清空（key 為 null）：一併結束範例模式", async () => {
      const { result } = renderHook(() => useLocalSnapshots());
      await loadDemo(result);

      localStorage.clear();
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", { key: null, storageArea: localStorage })
        );
      });

      expect(result.current.isDemo).toBe(false);
      expect(result.current.canLoadDemo).toBe(true);
    });
  });
});

// PRD 4.2「快照備註」、第 9 節 #72a～#72k
describe("useLocalSnapshots：快照備註", () => {
  function snap(date: string, note = "") {
    return {
      ...createEmptySnapshot(date),
      updatedAt: `${date}T00:00:00.000Z`,
      cashSources: [
        { id: "c1", name: "銀行", amount: 100000, restricted: false },
      ],
      note,
    };
  }

  function seed(...snapshots: ReturnType<typeof snap>[]) {
    persistFinanceData({ schemaVersion: 9, snapshots });
  }

  /** 已存檔的「日期 → 備註」。 */
  function storedNotes(): Record<string, string> {
    const loaded = loadFinanceData();
    if (loaded.status !== "ok") throw new Error("expected ok");
    return Object.fromEntries(
      loaded.data.snapshots.map((s) => [s.date, s.note])
    );
  }

  function setToday(date: string) {
    vi.setSystemTime(new Date(`${date}T10:00:00`));
  }

  /** 模擬使用者切回這個分頁。 */
  function returnToPage() {
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    setToday("2026-10-02");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("沒有資料時草稿的備註為空字串", () => {
    const { result } = renderHook(() => useLocalSnapshots());

    expect(result.current.draft.note).toBe("");
  });

  // #72a
  it("備註隨快照存檔，重新開啟後今天的表單帶回今天的備註", () => {
    const first = renderHook(() => useLocalSnapshots());
    act(() => {
      first.result.current.updateDraft({ note: "買房" });
    });
    act(() => {
      expect(first.result.current.save().ok).toBe(true);
    });
    expect(storedNotes()).toEqual({ "2026-10-02": "買房" });
    expect(first.result.current.isDirty).toBe(false);
    first.unmount();

    const { result } = renderHook(() => useLocalSnapshots());
    expect(result.current.draft.note).toBe("買房");
    expect(result.current.isDirty).toBe(false);
  });

  // #72c
  it("存檔時正規化備註：去除前後空白，連續空白與換行併成一個空格", () => {
    const { result } = renderHook(() => useLocalSnapshots());
    act(() => {
      result.current.updateDraft({ note: "  換工作 \n  加薪 " });
    });
    // 輸入過程不干涉使用者打字
    expect(result.current.draft.note).toBe("  換工作 \n  加薪 ");

    act(() => {
      result.current.save();
    });

    expect(storedNotes()).toEqual({ "2026-10-02": "換工作 加薪" });
    // 表單同步成存下來的內容，不會因為空白差異而顯示未存檔
    expect(result.current.draft.note).toBe("換工作 加薪");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.hasUnsavedEdits).toBe(false);
  });

  it("只有空白的備註存成空字串", () => {
    const { result } = renderHook(() => useLocalSnapshots());
    act(() => {
      result.current.updateDraft({ note: "   " });
    });
    act(() => {
      result.current.save();
    });

    expect(storedNotes()).toEqual({ "2026-10-02": "" });
  });

  // #72b
  it("今日草稿帶入最近一筆資料時不沿用備註，其餘欄位照常帶入", () => {
    seed(snap("2026-10-01", "買房"));
    const { result } = renderHook(() => useLocalSnapshots());

    expect(result.current.draft.date).toBe("2026-10-02");
    expect(result.current.draft.note).toBe("");
    expect(result.current.draft.cashSources[0].amount).toBe(100000);
    // 系統帶入、使用者沒動過：不算未存檔編輯
    expect(result.current.hasUnsavedEdits).toBe(false);

    act(() => {
      result.current.save();
    });
    expect(storedNotes()).toEqual({ "2026-10-01": "買房", "2026-10-02": "" });
  });

  // #72h
  it("只修改備註也算未存檔編輯；改回原內容後就不算", () => {
    seed(snap("2026-10-02", "買房"));
    const { result } = renderHook(() => useLocalSnapshots());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.hasUnsavedEdits).toBe(false);

    act(() => {
      result.current.updateDraft({ note: "買房簽約" });
    });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.hasUnsavedEdits).toBe(true);

    act(() => {
      result.current.updateDraft({ note: "買房" });
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.hasUnsavedEdits).toBe(false);
  });

  it("備註不影響任何計算結果", () => {
    seed(snap("2026-10-02"));
    const { result } = renderHook(() => useLocalSnapshots());
    const before = result.current.metrics;

    act(() => {
      result.current.updateDraft({ note: "買房" });
    });

    expect(result.current.metrics).toEqual(before);
  });

  // #72g
  it("修正模式：載入該日備註，儲存只改那一天，離開後還原今日草稿的備註", () => {
    seed(snap("2026-09-20"), snap("2026-09-25", "調薪"), snap("2026-10-02"));
    const { result } = renderHook(() => useLocalSnapshots());
    act(() => {
      result.current.updateDraft({ note: "今天的備註" });
    });

    act(() => {
      result.current.startEditing("2026-09-25");
    });
    expect(result.current.draft.note).toBe("調薪");

    act(() => {
      result.current.startEditing("2026-09-20");
    });
    expect(result.current.draft.note).toBe("");
    act(() => {
      result.current.updateDraft({ note: " 還清信貸 " });
    });
    act(() => {
      expect(result.current.save().ok).toBe(true);
    });

    expect(storedNotes()).toEqual({
      "2026-09-20": "還清信貸",
      "2026-09-25": "調薪",
      "2026-10-02": "",
    });
    expect(result.current.editingDate).toBeNull();
    expect(result.current.draft.date).toBe("2026-10-02");
    expect(result.current.draft.note).toBe("今天的備註");
    expect(result.current.hasUnsavedEdits).toBe(true);
  });

  it("取消修正不會寫入備註", () => {
    seed(snap("2026-09-20"), snap("2026-10-02"));
    const { result } = renderHook(() => useLocalSnapshots());
    act(() => {
      result.current.startEditing("2026-09-20");
    });
    act(() => {
      result.current.updateDraft({ note: "還清信貸" });
    });
    act(() => {
      result.current.cancelEditing();
    });

    expect(storedNotes()).toEqual({ "2026-09-20": "", "2026-10-02": "" });
    expect(result.current.draft.note).toBe("");
  });

  it("匯入的備份保留各筆快照的備註，今日草稿不沿用", async () => {
    vi.mocked(parseBackupFile).mockResolvedValue({
      status: "ok",
      data: { schemaVersion: 9, snapshots: [snap("2026-09-20", "買房")] },
    });
    const { result } = renderHook(() => useLocalSnapshots());

    await act(async () => {
      const res = await result.current.importBackup(
        new File(["x"], "backup.json")
      );
      expect(res.ok).toBe(true);
    });

    expect(result.current.snapshots.map((s) => s.note)).toEqual(["買房"]);
    expect(result.current.draft.date).toBe("2026-10-02");
    expect(result.current.draft.note).toBe("");
  });

  describe("跨日", () => {
    it("沒有未存檔編輯：重新帶入最近一筆資料，前一天的備註不沿用", () => {
      seed(snap("2026-10-02", "買房"));
      const { result } = renderHook(() => useLocalSnapshots());
      expect(result.current.draft.note).toBe("買房");

      setToday("2026-10-03");
      returnToPage();

      expect(result.current.draft.date).toBe("2026-10-03");
      expect(result.current.draft.note).toBe("");
      expect(result.current.hasUnsavedEdits).toBe(false);
    });

    // #72k
    it("保留的草稿不帶走使用者沒改過的備註", () => {
      seed(snap("2026-10-02", "買房"));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ monthlyExpense: 30000 });
      });

      setToday("2026-10-03");
      returnToPage();

      expect(result.current.draft.date).toBe("2026-10-03");
      expect(result.current.draft.monthlyExpense).toBe(30000);
      expect(result.current.draft.note).toBe("");
      expect(result.current.hasUnsavedEdits).toBe(true);

      act(() => {
        result.current.save();
      });
      expect(storedNotes()).toEqual({
        "2026-10-02": "買房",
        "2026-10-03": "",
      });
    });

    it("使用者剛改過、尚未存檔的備註跟著草稿到新的一天", () => {
      seed(snap("2026-10-02", "買房"));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ note: "交屋" });
      });

      setToday("2026-10-03");
      returnToPage();

      expect(result.current.draft.date).toBe("2026-10-03");
      expect(result.current.draft.note).toBe("交屋");
      expect(result.current.hasUnsavedEdits).toBe(true);

      act(() => {
        result.current.save();
      });
      expect(storedNotes()).toEqual({
        "2026-10-02": "買房",
        "2026-10-03": "交屋",
      });
    });

    it("沒有任何前景事件就跨日存檔：沒改過的備註不寫進新的一天", () => {
      seed(snap("2026-10-02", "買房"));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ monthlyExpense: 30000 });
      });

      setToday("2026-10-03");
      act(() => {
        result.current.save();
      });

      expect(storedNotes()).toEqual({
        "2026-10-02": "買房",
        "2026-10-03": "",
      });
      expect(result.current.draft.date).toBe("2026-10-03");
      expect(result.current.draft.note).toBe("");
      expect(result.current.draft.monthlyExpense).toBe(30000);
      expect(result.current.isDirty).toBe(false);
    });

    it("沒有任何前景事件就跨日存檔：剛改過的備註寫進新的一天", () => {
      seed(snap("2026-10-02", "買房"));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ note: "交屋" });
      });

      setToday("2026-10-03");
      act(() => {
        result.current.save();
      });

      expect(storedNotes()).toEqual({
        "2026-10-02": "買房",
        "2026-10-03": "交屋",
      });
    });

    it("修正模式中跨日：暫存的今日草稿同樣不帶走沒改過的備註", () => {
      seed(snap("2026-09-20", "調薪"), snap("2026-10-02", "買房"));
      const { result } = renderHook(() => useLocalSnapshots());
      act(() => {
        result.current.updateDraft({ monthlyExpense: 30000 });
      });
      act(() => {
        result.current.startEditing("2026-09-20");
      });

      setToday("2026-10-03");
      returnToPage();

      // 被修正的那一天不受換日影響
      expect(result.current.draft.date).toBe("2026-09-20");
      expect(result.current.draft.note).toBe("調薪");

      act(() => {
        result.current.cancelEditing();
      });
      expect(result.current.draft.date).toBe("2026-10-03");
      expect(result.current.draft.monthlyExpense).toBe(30000);
      expect(result.current.draft.note).toBe("");
    });
  });
});
