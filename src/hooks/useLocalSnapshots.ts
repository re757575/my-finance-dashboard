import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateMetrics } from "@/lib/calculations";
import {
  clearFinanceData,
  createEmptyFinanceData,
  getCurrentDate,
  getLatestSnapshot,
  getSnapshotForDate,
  getSnapshotsInRange,
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

export type TrendRange = 7 | 30 | 90 | "all";

const DEFAULT_TREND_RANGE: TrendRange = 90;

/** 依 PRD 4.2「今日表單自動帶入最近一筆資料」：今天無快照時，沿用最近一筆數值但日期/時間戳改為今天。 */
function buildInitialDraft(data: FinanceData, currentDate: string): Snapshot {
  const existing = getSnapshotForDate(data, currentDate);
  if (existing) return existing;

  const latest = getLatestSnapshot(data);
  if (latest) {
    return {
      ...latest,
      date: currentDate,
      updatedAt: new Date().toISOString(),
    };
  }

  return createEmptySnapshot(currentDate);
}

export function useLocalSnapshots() {
  const currentDate = useMemo(() => getCurrentDate(), []);
  const [loadStatus, setLoadStatus] = useState<LoadResult["status"]>("empty");
  const [financeData, setFinanceData] = useState<FinanceData>(
    createEmptyFinanceData()
  );
  const [draft, setDraft] = useState<Snapshot>(() =>
    createEmptySnapshot(currentDate)
  );
  const [trendRange, setTrendRange] = useState<TrendRange>(DEFAULT_TREND_RANGE);

  useEffect(() => {
    const result = loadFinanceData();
    setLoadStatus(result.status);

    const data =
      result.status === "ok" ? result.data : createEmptyFinanceData();
    setFinanceData(data);
    setDraft(buildInitialDraft(data, currentDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics: CalculatedMetrics = useMemo(
    () => calculateMetrics(draft),
    [draft]
  );

  const savedSnapshot = getSnapshotForDate(financeData, currentDate);
  const isDirty =
    JSON.stringify(savedSnapshot ?? null) !== JSON.stringify(draft);

  const updateDraft = useCallback((patch: Partial<Snapshot>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  /** 「更新儀表板」：正式將今日草稿寫入 LocalStorage（PRD 4.2 節）。version-mismatch 狀態下拒絕覆蓋既有資料。 */
  const save = useCallback((): { ok: boolean; reason?: string } => {
    if (loadStatus === "version-mismatch") {
      return {
        ok: false,
        reason: "本地資料版本不符，為避免覆蓋既有資料，已暫停存檔。",
      };
    }
    const finalized: Snapshot = {
      ...draft,
      date: currentDate,
      updatedAt: new Date().toISOString(),
    };
    const next = upsertSnapshot(financeData, finalized);
    persistFinanceData(next);
    setFinanceData(next);
    setDraft(finalized);
    setLoadStatus("ok");
    return { ok: true };
  }, [draft, financeData, currentDate, loadStatus]);

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
      setDraft(buildInitialDraft(result.data, currentDate));
      setLoadStatus("ok");
      return { ok: true };
    },
    [currentDate]
  );

  /** 清空前必須先由 UI 呼叫 exportBackup() 強制備份，才能呼叫本函式（PRD 4.2 節）。 */
  const clearAllData = useCallback(() => {
    clearFinanceData();
    const empty = createEmptyFinanceData();
    setFinanceData(empty);
    setDraft(createEmptySnapshot(currentDate));
    setLoadStatus("empty");
  }, [currentDate]);

  const allSnapshots = useMemo(
    () =>
      [...financeData.snapshots].sort((a, b) => a.date.localeCompare(b.date)),
    [financeData]
  );
  /** 趨勢圖與「一鍵複製 AI 分析提示詞」共用同一個範圍（PRD 5.4 節）。 */
  const visibleSnapshots = useMemo(
    () =>
      trendRange === "all"
        ? allSnapshots
        : getSnapshotsInRange(financeData, trendRange),
    [financeData, allSnapshots, trendRange]
  );

  return {
    currentDate,
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
    trendRange,
    setTrendRange,
  };
}
