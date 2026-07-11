import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateMetrics } from "@/lib/calculations";
import {
  clearFinanceData,
  createEmptyFinanceData,
  getCurrentMonth,
  getLatestSnapshot,
  getRecentSnapshots,
  getSnapshotForMonth,
  loadFinanceData,
  persistFinanceData,
  upsertSnapshot,
  type LoadResult,
} from "@/lib/storage";
import { downloadBackup, parseBackupFile } from "@/lib/backup";
import {
  createEmptySnapshot,
  type CalculatedMetrics,
  type FinanceData,
  type Snapshot,
} from "@/types/schema";

const TREND_WINDOW_MONTHS = 12;

/** 依 PRD 4.2「本月表單自動帶入上月資料」：當月無快照時，沿用上月數值但月份/時間戳改為當月。 */
function buildInitialDraft(data: FinanceData, currentMonth: string): Snapshot {
  const existing = getSnapshotForMonth(data, currentMonth);
  if (existing) return existing;

  const latest = getLatestSnapshot(data);
  if (latest) {
    return {
      ...latest,
      month: currentMonth,
      updatedAt: new Date().toISOString(),
    };
  }

  return createEmptySnapshot(currentMonth);
}

export function useLocalSnapshots() {
  const currentMonth = useMemo(() => getCurrentMonth(), []);
  const [loadStatus, setLoadStatus] = useState<LoadResult["status"]>("empty");
  const [financeData, setFinanceData] = useState<FinanceData>(
    createEmptyFinanceData()
  );
  const [draft, setDraft] = useState<Snapshot>(() =>
    createEmptySnapshot(currentMonth)
  );
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    const result = loadFinanceData();
    setLoadStatus(result.status);

    const data =
      result.status === "ok" ? result.data : createEmptyFinanceData();
    setFinanceData(data);
    setDraft(buildInitialDraft(data, currentMonth));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics: CalculatedMetrics = useMemo(
    () => calculateMetrics(draft),
    [draft]
  );

  const savedSnapshot = getSnapshotForMonth(financeData, currentMonth);
  const isDirty =
    JSON.stringify(savedSnapshot ?? null) !== JSON.stringify(draft);

  const updateDraft = useCallback((patch: Partial<Snapshot>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  /** 「更新儀表板」：正式將當月草稿寫入 LocalStorage（PRD 4.2 節）。version-mismatch 狀態下拒絕覆蓋既有資料。 */
  const save = useCallback((): { ok: boolean; reason?: string } => {
    if (loadStatus === "version-mismatch") {
      return {
        ok: false,
        reason: "本地資料版本不符，為避免覆蓋既有資料，已暫停存檔。",
      };
    }
    const finalized: Snapshot = {
      ...draft,
      month: currentMonth,
      updatedAt: new Date().toISOString(),
    };
    const next = upsertSnapshot(financeData, finalized);
    persistFinanceData(next);
    setFinanceData(next);
    setDraft(finalized);
    setLoadStatus("ok");
    return { ok: true };
  }, [draft, financeData, currentMonth, loadStatus]);

  const exportBackup = useCallback(() => {
    downloadBackup(financeData);
  }, [financeData]);

  /** 匯入前的二次確認由呼叫端（UI Dialog）負責，這裡只處理實際覆蓋動作。 */
  const importBackup = useCallback(
    async (file: File): Promise<{ ok: boolean; reason?: string }> => {
      const result = await parseBackupFile(file);
      if (result.status !== "ok") {
        return {
          ok: false,
          reason: "備份檔無法讀取或版本不相容，匯入已取消。",
        };
      }
      persistFinanceData(result.data);
      setFinanceData(result.data);
      setDraft(buildInitialDraft(result.data, currentMonth));
      setLoadStatus("ok");
      return { ok: true };
    },
    [currentMonth]
  );

  /** 清空前必須先由 UI 呼叫 exportBackup() 強制備份，才能呼叫本函式（PRD 4.2 節）。 */
  const clearAllData = useCallback(() => {
    clearFinanceData();
    const empty = createEmptyFinanceData();
    setFinanceData(empty);
    setDraft(createEmptySnapshot(currentMonth));
    setLoadStatus("empty");
  }, [currentMonth]);

  const allSnapshots = useMemo(
    () =>
      [...financeData.snapshots].sort((a, b) => a.month.localeCompare(b.month)),
    [financeData]
  );
  const recentSnapshots = useMemo(
    () => getRecentSnapshots(financeData, TREND_WINDOW_MONTHS),
    [financeData]
  );
  const visibleSnapshots = showAllHistory ? allSnapshots : recentSnapshots;

  return {
    currentMonth,
    loadStatus,
    draft,
    metrics,
    isDirty,
    updateDraft,
    save,
    exportBackup,
    importBackup,
    clearAllData,
    snapshotCount: allSnapshots.length,
    visibleSnapshots,
    showAllHistory,
    setShowAllHistory,
  };
}
