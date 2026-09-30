import { useCallback, useEffect, useMemo, useState } from "react";
import { advanceDebtsByMonths, calculateMetrics } from "@/lib/calculations";
import {
  clearFinanceData,
  clearLastBackupAt,
  createEmptyFinanceData,
  getCurrentDate,
  getLatestSnapshot,
  getSnapshotForDate,
  getSnapshotsInRange,
  loadFinanceData,
  loadLastBackupAt,
  monthsBetweenDates,
  persistFinanceData,
  recordBackupNow,
  upsertSnapshot,
  type LoadResult,
} from "@/lib/storage";
import {
  downloadBackup,
  downloadEncryptedBackup,
  parseBackupFile,
} from "@/lib/backup";
import { CryptoUnavailableError } from "@/lib/backupCrypto";
import {
  createEmptySnapshot,
  type CalculatedMetrics,
  type Debt,
  type FinanceData,
  type Snapshot,
} from "@/types/schema";

export type TrendRange = 7 | 30 | 90 | "all";

const DEFAULT_TREND_RANGE: TrendRange = 90;

/** 標示負債草稿中，哪些欄位是系統自動估算、尚未被使用者手動確認過（PRD 4.2 節）。 */
export type EstimatedDebtFields = Record<
  string,
  { principal?: boolean; remainingMonths?: boolean }
>;

/** 比對推進前後的負債清單，找出哪些負債的哪些欄位被自動估算改動過。 */
function computeEstimatedDebtFields(
  before: Debt[],
  after: Debt[]
): EstimatedDebtFields {
  const result: EstimatedDebtFields = {};
  for (const debt of after) {
    const prev = before.find((d) => d.id === debt.id);
    if (!prev) continue;
    const fields: { principal?: boolean; remainingMonths?: boolean } = {};
    if (prev.principal !== debt.principal) fields.principal = true;
    if (prev.remainingMonths !== debt.remainingMonths)
      fields.remainingMonths = true;
    if (fields.principal || fields.remainingMonths) result[debt.id] = fields;
  }
  return result;
}

/**
 * 依 PRD 4.2「今日表單自動帶入最近一筆資料」：今天無快照時，沿用最近一筆數值但日期/時間戳改為今天，
 * 並依經過的曆月數自動估算負債的剩餘本金／剩餘期數（見「負債剩餘本金／期數自動估算」）。
 */
function buildInitialDraft(
  data: FinanceData,
  currentDate: string
): { snapshot: Snapshot; estimatedFields: EstimatedDebtFields } {
  const existing = getSnapshotForDate(data, currentDate);
  if (existing) return { snapshot: existing, estimatedFields: {} };

  const latest = getLatestSnapshot(data);
  if (latest) {
    const monthsElapsed = monthsBetweenDates(latest.date, currentDate);
    const debts = advanceDebtsByMonths(latest.debts, monthsElapsed);
    return {
      snapshot: {
        ...latest,
        date: currentDate,
        updatedAt: new Date().toISOString(),
        debts,
      },
      estimatedFields: computeEstimatedDebtFields(latest.debts, debts),
    };
  }

  return { snapshot: createEmptySnapshot(currentDate), estimatedFields: {} };
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
  const [estimatedDebtFields, setEstimatedDebtFields] =
    useState<EstimatedDebtFields>({});
  const [trendRange, setTrendRange] = useState<TrendRange>(DEFAULT_TREND_RANGE);
  /** 上次備份時間（ISO 8601），獨立於快照 schema（PRD 6.2 節）；從未備份為 null。 */
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);

  useEffect(() => {
    const result = loadFinanceData();
    setLoadStatus(result.status);

    const data =
      result.status === "ok" ? result.data : createEmptyFinanceData();
    setFinanceData(data);
    const { snapshot, estimatedFields } = buildInitialDraft(data, currentDate);
    setDraft(snapshot);
    setEstimatedDebtFields(estimatedFields);
    setLastBackupAt(loadLastBackupAt());
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

  /**
   * 負債清單專用的更新入口：使用者手動修改「剩餘本金」或「剩餘還款期數」時，
   * 移除該欄位的「系統估算」標記（PRD 4.2 節），其餘寫入行為與 updateDraft 相同。
   */
  const updateDebts = useCallback(
    (debts: Debt[]) => {
      setEstimatedDebtFields((prev) => {
        if (Object.keys(prev).length === 0) return prev;
        const next: EstimatedDebtFields = {};
        for (const debt of debts) {
          const flags = prev[debt.id];
          if (!flags) continue;
          const prevDebt = draft.debts.find((d) => d.id === debt.id);
          const principal =
            flags.principal && prevDebt?.principal === debt.principal;
          const remainingMonths =
            flags.remainingMonths &&
            prevDebt?.remainingMonths === debt.remainingMonths;
          if (principal || remainingMonths) {
            next[debt.id] = {
              ...(principal && { principal: true }),
              ...(remainingMonths && { remainingMonths: true }),
            };
          }
        }
        return next;
      });
      updateDraft({ debts });
    },
    [draft.debts, updateDraft]
  );

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
    setEstimatedDebtFields({});
    setLoadStatus("ok");
    return { ok: true };
  }, [draft, financeData, currentDate, loadStatus]);

  /** 明文匯出；成功後記錄上次備份時間（PRD 4.2「備份提醒」）。 */
  const exportBackup = useCallback(() => {
    downloadBackup(financeData);
    setLastBackupAt(recordBackupNow());
  }, [financeData]);

  /** 加密匯出（PRD 4.2）；加密失敗時不下載、不記錄上次備份時間。密碼只經由參數傳入，不保存。 */
  const exportEncryptedBackup = useCallback(
    async (password: string): Promise<{ ok: boolean; reason?: string }> => {
      try {
        await downloadEncryptedBackup(financeData, password);
      } catch (error) {
        return {
          ok: false,
          reason:
            error instanceof CryptoUnavailableError
              ? error.message
              : "加密匯出失敗，請重試。",
        };
      }
      setLastBackupAt(recordBackupNow());
      return { ok: true };
    },
    [financeData]
  );

  /** 匯入前的二次確認由呼叫端（UI Dialog）負責，這裡只處理實際覆蓋動作。 */
  const importBackup = useCallback(
    async (
      file: File,
      password?: string
    ): Promise<{ ok: boolean; reason?: string; needsPassword?: boolean }> => {
      const result = await parseBackupFile(file, password);
      if (result.status === "encrypted") {
        return {
          ok: false,
          needsPassword: true,
          reason: "此備份檔已加密，請輸入密碼。",
        };
      }
      if (result.status === "wrong-password") {
        return { ok: false, reason: "密碼錯誤或備份檔已損毀，匯入已取消。" };
      }
      if (result.status === "crypto-unavailable") {
        return { ok: false, reason: "此環境不支援加密（需要 HTTPS）。" };
      }
      if (result.status !== "ok") {
        return {
          ok: false,
          reason: "備份檔無法讀取或版本不相容，匯入已取消。",
        };
      }
      persistFinanceData(result.data);
      setFinanceData(result.data);
      const { snapshot, estimatedFields } = buildInitialDraft(
        result.data,
        currentDate
      );
      setDraft(snapshot);
      setEstimatedDebtFields(estimatedFields);
      setLoadStatus("ok");
      return { ok: true };
    },
    [currentDate]
  );

  /** 清空前必須先由 UI 呼叫 exportBackup() 強制備份，才能呼叫本函式（PRD 4.2 節）。 */
  const clearAllData = useCallback(() => {
    clearFinanceData();
    clearLastBackupAt();
    setLastBackupAt(null);
    const empty = createEmptyFinanceData();
    setFinanceData(empty);
    setDraft(createEmptySnapshot(currentDate));
    setEstimatedDebtFields({});
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
    estimatedDebtFields,
    updateDebts,
    save,
    exportBackup,
    exportEncryptedBackup,
    importBackup,
    clearAllData,
    lastBackupAt,
    /** 已存檔快照中最早／最近一筆的日期，供備份提醒與資料新鮮度使用（PRD 4.2）。 */
    earliestSnapshotDate: allSnapshots[0]?.date,
    latestSnapshotDate: allSnapshots.at(-1)?.date,
    snapshotCount: allSnapshots.length,
    visibleSnapshots,
    trendRange,
    setTrendRange,
  };
}
