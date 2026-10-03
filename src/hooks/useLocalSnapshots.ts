import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { advanceDebtsByMonths, calculateMetrics } from "@/lib/calculations";
import {
  LAST_BACKUP_KEY,
  STORAGE_KEY,
  clearFinanceData,
  clearLastBackupAt,
  createEmptyFinanceData,
  getCurrentDate,
  getLatestSnapshot,
  getSnapshotForDate,
  getSnapshotsInRange,
  getSnapshotsYearToDate,
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

/**
 * 趨勢圖範圍（PRD 4.2「趨勢圖範圍選項」）：數字為「最近 N 天（含今天）」，365 即「1 年」；
 * "ytd" 為「今年以來」（今天所屬年份的 1 月 1 日起）；"all" 為全部快照。
 */
export type TrendRange = 7 | 30 | 90 | 365 | "ytd" | "all";

const DEFAULT_TREND_RANGE: TrendRange = 90;

/** 寫入 LocalStorage 失敗時顯示的訊息（PRD 4.2「寫入失敗防護」）。 */
const STORAGE_WRITE_FAILED =
  "無法寫入瀏覽器儲存空間（可能已滿或被停用），本次變更尚未存檔。";

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

/** 修正模式下暫存的今日草稿；baseline 是判斷該草稿有無未存檔編輯的比較基準。 */
interface StashedDraft {
  draft: Snapshot;
  estimatedFields: EstimatedDebtFields;
  baseline: Snapshot;
}

/** 以已存檔資料重建某一天的草稿作為暫存內容，視為沒有任何未存檔編輯。 */
function buildFreshStash(data: FinanceData, date: string): StashedDraft {
  const { snapshot, estimatedFields } = buildInitialDraft(data, date);
  return { draft: snapshot, estimatedFields, baseline: snapshot };
}

export function useLocalSnapshots() {
  /** 今天的日期；頁面開著跨過午夜時由 syncCurrentDate 更新（PRD 4.2「跨日自動換日」）。 */
  const [currentDate, setCurrentDate] = useState(() => getCurrentDate());
  const [loadStatus, setLoadStatus] = useState<LoadResult["status"]>("empty");
  const [financeData, setFinanceData] = useState<FinanceData>(
    createEmptyFinanceData()
  );
  const [draft, setDraft] = useState<Snapshot>(() =>
    createEmptySnapshot(currentDate)
  );
  /**
   * 草稿最近一次由程式載入（初始帶入、存檔、匯入、進入修正模式等）時的內容，
   * 用來分辨「使用者手動編輯過」與「系統帶入後沒動過」（PRD 4.2「未存檔離開提醒」）。
   */
  const [baseline, setBaseline] = useState<Snapshot>(draft);
  const [estimatedDebtFields, setEstimatedDebtFields] =
    useState<EstimatedDebtFields>({});
  const [trendRange, setTrendRange] = useState<TrendRange>(DEFAULT_TREND_RANGE);
  /** 上次備份時間（ISO 8601），獨立於快照 schema（PRD 6.2 節）；從未備份為 null。 */
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  /**
   * 修正模式（PRD 4.2「修正歷史快照」）：目前正在修正的歷史快照日期，null 代表一般狀態（表單＝今天）。
   * 進入時把今日草稿暫存在 ref（只存在於記憶體，不寫入 LocalStorage），離開時還原。
   */
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const stashedDraftRef = useRef<StashedDraft | null>(null);
  /** 暫存中的今日草稿是否有未存檔編輯；ref 不會觸發重新渲染，故另以 state 記錄。 */
  const [stashHasEdits, setStashHasEdits] = useState(false);

  /** 由程式載入草稿，並重設未存檔編輯的比較基準。 */
  const loadDraft = useCallback((snapshot: Snapshot) => {
    setDraft(snapshot);
    setBaseline(snapshot);
  }, []);

  useEffect(() => {
    const result = loadFinanceData();
    setLoadStatus(result.status);

    const data =
      result.status === "ok" ? result.data : createEmptyFinanceData();
    setFinanceData(data);
    const { snapshot, estimatedFields } = buildInitialDraft(data, currentDate);
    loadDraft(snapshot);
    setEstimatedDebtFields(estimatedFields);
    setLastBackupAt(loadLastBackupAt());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics: CalculatedMetrics = useMemo(
    () => calculateMetrics(draft),
    [draft]
  );

  // 修正模式下，draft.date 是被修正的那一天，需與該日的已存檔快照比較
  const savedSnapshot = getSnapshotForDate(financeData, draft.date);
  const isDirty =
    JSON.stringify(savedSnapshot ?? null) !== JSON.stringify(draft);
  // 與 isDirty 不同：今天尚未存檔、但只是系統帶入而使用者沒動過的草稿，不算未存檔編輯
  const draftHasEdits = JSON.stringify(baseline) !== JSON.stringify(draft);
  const hasUnsavedEdits = draftHasEdits || stashHasEdits;

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

  /** 離開修正模式並還原進入前暫存的今日草稿；非修正模式時什麼都不做。 */
  const leaveEditing = useCallback(() => {
    const stash = stashedDraftRef.current;
    stashedDraftRef.current = null;
    setEditingDate(null);
    setStashHasEdits(false);
    if (stash) {
      setDraft(stash.draft);
      setBaseline(stash.baseline);
      setEstimatedDebtFields(stash.estimatedFields);
    }
  }, []);

  /**
   * 進入修正模式（PRD 4.2「修正歷史快照」）：表單載入該日快照，日期不可更改；今日草稿暫存待還原。
   * 已在修正模式時直接切換對象，不重複暫存（仍保留最初進入前的今日草稿）。
   * 今天的快照不走修正模式（本來就是主表單）、version-mismatch 狀態下不提供。
   */
  const startEditing = useCallback(
    (date: string) => {
      if (loadStatus === "version-mismatch" || date === currentDate) return;
      const target = getSnapshotForDate(financeData, date);
      if (!target) return;
      if (stashedDraftRef.current === null) {
        stashedDraftRef.current = {
          draft,
          estimatedFields: estimatedDebtFields,
          baseline,
        };
        setStashHasEdits(draftHasEdits);
      }
      setEditingDate(date);
      // 修正歷史資料時不做負債自動估算，也不顯示「系統估算」標記
      setEstimatedDebtFields({});
      loadDraft(target);
    },
    [
      loadStatus,
      currentDate,
      financeData,
      draft,
      estimatedDebtFields,
      baseline,
      draftHasEdits,
      loadDraft,
    ]
  );

  /**
   * 刪除單筆歷史快照（PRD 4.2「刪除歷史快照」）：只移除該日期，其他日期不受影響；不更新上次備份時間。
   * 二次確認由呼叫端（UI Dialog）負責。version-mismatch 狀態下拒絕，避免誤動版本不相容的既有資料。
   */
  const deleteSnapshot = useCallback(
    (date: string): { ok: boolean; reason?: string } => {
      if (loadStatus === "version-mismatch") {
        return {
          ok: false,
          reason: "本地資料版本不符，為避免誤動既有資料，已暫停刪除。",
        };
      }
      if (!getSnapshotForDate(financeData, date)) {
        return { ok: false, reason: `找不到 ${date} 的快照。` };
      }
      const next: FinanceData = {
        ...financeData,
        snapshots: financeData.snapshots.filter((s) => s.date !== date),
      };
      if (!persistFinanceData(next)) {
        return { ok: false, reason: STORAGE_WRITE_FAILED };
      }
      setFinanceData(next);
      if (editingDate === date) leaveEditing();
      return { ok: true };
    },
    [loadStatus, financeData, editingDate, leaveEditing]
  );

  /**
   * 頁面開著跨過午夜時換日（PRD 4.2「跨日自動換日」），回傳今天的日期。
   * 沒有未存檔編輯的今日草稿重新帶入最近一筆資料；有編輯的保留內容，改為新一天的草稿。
   * 修正模式下表單仍是被修正的那一天，只更新暫存的今日草稿。
   */
  const syncCurrentDate = useCallback((): string => {
    const today = getCurrentDate();
    if (today === currentDate) return today;
    setCurrentDate(today);
    const stash = stashedDraftRef.current;
    if (stash) {
      stashedDraftRef.current = stashHasEdits
        ? {
            ...stash,
            draft: { ...stash.draft, date: today },
            baseline: { ...stash.baseline, date: today },
          }
        : buildFreshStash(financeData, today);
      return today;
    }
    if (draftHasEdits) {
      setDraft((prev) => ({ ...prev, date: today }));
      setBaseline((prev) => ({ ...prev, date: today }));
      return today;
    }
    const { snapshot, estimatedFields } = buildInitialDraft(financeData, today);
    loadDraft(snapshot);
    setEstimatedDebtFields(estimatedFields);
    return today;
  }, [currentDate, financeData, stashHasEdits, draftHasEdits, loadDraft]);

  /**
   * 「更新儀表板」：正式將今日草稿寫入 LocalStorage（PRD 4.2 節）。version-mismatch 狀態下拒絕覆蓋既有資料。
   * 修正模式下改為「儲存修正」：只覆蓋被修正的那一天，存檔後離開修正模式並還原今日草稿（PRD 4.2「修正歷史快照」）。
   * 寫入失敗時不更新任何狀態，草稿維持未存檔，使用者可重試（PRD 4.2「寫入失敗防護」）。
   */
  const save = useCallback((): { ok: boolean; reason?: string } => {
    if (loadStatus === "version-mismatch") {
      return {
        ok: false,
        reason: "本地資料版本不符，為避免覆蓋既有資料，已暫停存檔。",
      };
    }
    // 存檔一律寫入實際存檔當天，不沿用頁面開啟當天的日期
    const today = syncCurrentDate();
    const finalized: Snapshot = {
      ...draft,
      date: editingDate ?? today,
      updatedAt: new Date().toISOString(),
    };
    const next = upsertSnapshot(financeData, finalized);
    if (!persistFinanceData(next)) {
      return { ok: false, reason: STORAGE_WRITE_FAILED };
    }
    setFinanceData(next);
    setLoadStatus("ok");
    if (editingDate) {
      leaveEditing();
    } else {
      loadDraft(finalized);
      setEstimatedDebtFields({});
    }
    return { ok: true };
  }, [
    draft,
    financeData,
    loadStatus,
    editingDate,
    leaveEditing,
    syncCurrentDate,
    loadDraft,
  ]);

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
      if (!persistFinanceData(result.data)) {
        return { ok: false, reason: STORAGE_WRITE_FAILED };
      }
      setFinanceData(result.data);
      const { snapshot, estimatedFields } = buildInitialDraft(
        result.data,
        currentDate
      );
      stashedDraftRef.current = null;
      setEditingDate(null);
      setStashHasEdits(false);
      loadDraft(snapshot);
      setEstimatedDebtFields(estimatedFields);
      setLoadStatus("ok");
      return { ok: true };
    },
    [currentDate, loadDraft]
  );

  /** 清空前必須先由 UI 呼叫 exportBackup() 強制備份，才能呼叫本函式（PRD 4.2 節）。 */
  const clearAllData = useCallback(() => {
    clearFinanceData();
    clearLastBackupAt();
    setLastBackupAt(null);
    const empty = createEmptyFinanceData();
    setFinanceData(empty);
    stashedDraftRef.current = null;
    setEditingDate(null);
    setStashHasEdits(false);
    loadDraft(createEmptySnapshot(currentDate));
    setEstimatedDebtFields({});
    setLoadStatus("empty");
  }, [currentDate, loadDraft]);

  /**
   * 其他分頁寫入 LocalStorage 後重新讀取（PRD 4.2「多分頁資料同步」），
   * 避免之後以過期的 financeData 整批覆蓋另一分頁剛存的快照。
   * 沒有未存檔編輯的草稿一併更新；有編輯的保留，存檔時只覆蓋自己那一天。
   */
  const syncFromStorage = useCallback(() => {
    const result = loadFinanceData();
    const data =
      result.status === "ok" ? result.data : createEmptyFinanceData();
    setLoadStatus(result.status);
    setFinanceData(data);
    if (stashedDraftRef.current && !stashHasEdits) {
      stashedDraftRef.current = buildFreshStash(data, currentDate);
    }
    if (editingDate) {
      const target = getSnapshotForDate(data, editingDate);
      // 被修正的快照已在其他分頁刪除：離開修正模式，避免存檔時又把它寫回來
      if (!target) leaveEditing();
      else if (!draftHasEdits) loadDraft(target);
      return;
    }
    if (draftHasEdits) return;
    const { snapshot, estimatedFields } = buildInitialDraft(data, currentDate);
    loadDraft(snapshot);
    setEstimatedDebtFields(estimatedFields);
  }, [
    currentDate,
    editingDate,
    stashHasEdits,
    draftHasEdits,
    leaveEditing,
    loadDraft,
  ]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      // key 為 null 代表整個 LocalStorage 被清空
      if (event.key === null || event.key === LAST_BACKUP_KEY) {
        setLastBackupAt(loadLastBackupAt());
      }
      if (event.key === null || event.key === STORAGE_KEY) syncFromStorage();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [syncFromStorage]);

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === "visible") syncCurrentDate();
    };
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", handleVisible);
    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", handleVisible);
    };
  }, [syncCurrentDate]);

  // 只在有未存檔編輯時才註冊，離開前由瀏覽器跳出原生確認（PRD 4.2「未存檔離開提醒」）
  useEffect(() => {
    if (!hasUnsavedEdits) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 舊版 Chrome／Safari 需設定 returnValue 才會跳出確認
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedEdits]);

  const allSnapshots = useMemo(
    () =>
      [...financeData.snapshots].sort((a, b) => a.date.localeCompare(b.date)),
    [financeData]
  );
  /** 趨勢圖與「一鍵複製 AI 分析提示詞」共用同一個範圍（PRD 5.4 節）。 */
  const visibleSnapshots = useMemo(() => {
    if (trendRange === "all") return allSnapshots;
    // 「今年以來」的年份取自 currentDate（state），跨年換日後自動改以新年度起算
    if (trendRange === "ytd") {
      return getSnapshotsYearToDate(financeData, currentDate);
    }
    return getSnapshotsInRange(financeData, trendRange, currentDate);
  }, [financeData, allSnapshots, trendRange, currentDate]);

  return {
    currentDate,
    loadStatus,
    draft,
    metrics,
    isDirty,
    /** 有使用者手動編輯且尚未存檔的內容（含修正模式下暫存的今日草稿），離開頁面前會提醒。 */
    hasUnsavedEdits,
    updateDraft,
    estimatedDebtFields,
    updateDebts,
    save,
    editingDate,
    startEditing,
    cancelEditing: leaveEditing,
    deleteSnapshot,
    exportBackup,
    exportEncryptedBackup,
    importBackup,
    clearAllData,
    lastBackupAt,
    /** 已存檔快照中最早／最近一筆的日期，供備份提醒與資料新鮮度使用（PRD 4.2）。 */
    earliestSnapshotDate: allSnapshots[0]?.date,
    latestSnapshotDate: allSnapshots.at(-1)?.date,
    /** 所有已存檔快照（日期遞增），供歷史快照清單使用（PRD 4.2「歷史快照清單」）。 */
    snapshots: allSnapshots,
    snapshotCount: allSnapshots.length,
    visibleSnapshots,
    trendRange,
    setTrendRange,
  };
}
