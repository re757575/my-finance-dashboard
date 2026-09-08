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
  parseBackupFile: vi.fn(),
}));

import { useLocalSnapshots } from "@/hooks/useLocalSnapshots";
import { downloadBackup, parseBackupFile } from "@/lib/backup";
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
      schemaVersion: 4 as const,
      snapshots: [
        {
          date: "2026-01-01",
          updatedAt: "2026-01-01T00:00:00Z",
          cashSources: [{ id: "x", name: "匯入現金", amount: 88888 }],
          twStockValue: 0,
          usStockValue: 0,
          usStockCurrency: "USD" as const,
          exchangeRate: 0,
          debts: [],
          incomeSources: [],
          monthlyExpense: 0,
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
        schemaVersion: 4,
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
        schemaVersion: 4,
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
        schemaVersion: 4,
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
        schemaVersion: 4,
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
        schemaVersion: 4,
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
