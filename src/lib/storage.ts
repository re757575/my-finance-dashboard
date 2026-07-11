import {
  CURRENT_SCHEMA_VERSION,
  type FinanceData,
  type Snapshot,
} from "@/types/schema";

export const STORAGE_KEY = "my_finance_dashboard_data";

export type LoadResult =
  | { status: "empty" }
  | { status: "ok"; data: FinanceData }
  | { status: "corrupted" }
  | { status: "version-mismatch"; foundVersion: unknown };

/** 依 PRD 第 6.1 節規則解析快照資料：格式錯誤或版本不符時不拋錯，回傳明確狀態供上層處理。 */
export function parseFinanceData(raw: string | null): LoadResult {
  if (raw === null) return { status: "empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupted" };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("snapshots" in parsed) ||
    !Array.isArray((parsed as { snapshots: unknown }).snapshots)
  ) {
    return { status: "corrupted" };
  }

  const data = parsed as FinanceData;
  if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return { status: "version-mismatch", foundVersion: data.schemaVersion };
  }

  return { status: "ok", data };
}

export function loadFinanceData(): LoadResult {
  return parseFinanceData(localStorage.getItem(STORAGE_KEY));
}

export function persistFinanceData(data: FinanceData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearFinanceData(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function createEmptyFinanceData(): FinanceData {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, snapshots: [] };
}

export function getCurrentMonth(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function sortedByMonth(snapshots: Snapshot[]): Snapshot[] {
  return [...snapshots].sort((a, b) => a.month.localeCompare(b.month));
}

/** 同月覆蓋、跨月新增（PRD 5.2 / 6 節：快照顆粒度為月）。 */
export function upsertSnapshot(
  data: FinanceData,
  snapshot: Snapshot
): FinanceData {
  const withoutMonth = data.snapshots.filter((s) => s.month !== snapshot.month);
  return {
    ...data,
    snapshots: sortedByMonth([...withoutMonth, snapshot]),
  };
}

export function getSnapshotForMonth(
  data: FinanceData,
  month: string
): Snapshot | undefined {
  return data.snapshots.find((s) => s.month === month);
}

/** 最近一筆快照（月份最大者），用於「本月表單自動帶入上月資料」。 */
export function getLatestSnapshot(data: FinanceData): Snapshot | undefined {
  if (data.snapshots.length === 0) return undefined;
  return sortedByMonth(data.snapshots).at(-1);
}

/** 趨勢圖預設視窗：最近 N 筆快照，資料本身不刪除（PRD 4.2 節）。 */
export function getRecentSnapshots(
  data: FinanceData,
  count: number
): Snapshot[] {
  return sortedByMonth(data.snapshots).slice(-count);
}
