import {
  CURRENT_SCHEMA_VERSION,
  type Debt,
  type FinanceData,
  type Snapshot,
} from "@/types/schema";

export const STORAGE_KEY = "my_finance_dashboard_data";

export type LoadResult =
  | { status: "empty" }
  | { status: "ok"; data: FinanceData }
  | { status: "corrupted" }
  | { status: "version-mismatch"; foundVersion: unknown };

interface RawSnapshotV1 {
  month: string;
  updatedAt: string;
  cashSources: { id: string; name: string; amount: number }[];
  twStockValue: number;
  usStockValue: number;
  exchangeRate: number;
  loan: number;
  otherDebt: number;
  cashFlow: number;
}

interface RawSnapshotV2 extends RawSnapshotV1 {
  usStockCurrency: "USD" | "TWD";
}

/** V1（無 usStockCurrency）→ V2：美股市值當時一律以 USD 計價換算，遷移時補上此預設值。 */
function migrateV1ToV2(raw: { schemaVersion: 1; snapshots: RawSnapshotV1[] }): {
  schemaVersion: 2;
  snapshots: RawSnapshotV2[];
} {
  return {
    schemaVersion: 2,
    snapshots: raw.snapshots.map((s) => ({ ...s, usStockCurrency: "USD" })),
  };
}

/**
 * V2（loan/otherDebt 單一數字、cashFlow 語意為淨現金流）→ V3：
 * loan 轉為一筆「房貸」類別負債、otherDebt 轉為一筆「其他」類別負債，利率/期數皆補 0
 * （沿用本金，日後由使用者自行補上利率/期數才能看到正確的每月應還款金額）；
 * 新增空的 incomeSources；不沿用舊 cashFlow 數值（語意為淨現金流，與新欄位「支出」相反，沿用會誤導使用者）。
 */
function migrateV2ToV3(raw: {
  schemaVersion: 2;
  snapshots: RawSnapshotV2[];
}): FinanceData {
  return {
    schemaVersion: 3,
    snapshots: raw.snapshots.map((s) => {
      const { loan, otherDebt, cashFlow: _cashFlow, ...rest } = s;
      const debts: Debt[] = [
        {
          id: crypto.randomUUID(),
          name: "銀行貸款",
          category: "房貸",
          principal: loan,
          annualRate: 0,
          remainingMonths: 0,
          repaymentMethod: "amortizing",
        },
        {
          id: crypto.randomUUID(),
          name: "短期/其他負債",
          category: "其他",
          principal: otherDebt,
          annualRate: 0,
          remainingMonths: 0,
          repaymentMethod: "amortizing",
        },
      ];
      return {
        ...rest,
        debts,
        incomeSources: [],
        monthlyExpense: 0,
      };
    }),
  };
}

/** 已知舊版本資料的轉換邏輯（PRD 第 6.1 節）。回傳 null 代表版本無法識別/轉換，不得覆蓋原始資料。逐版遞進遷移，確保任何舊版本都能一路轉到目前版本。 */
function migrateFinanceData(parsed: {
  schemaVersion: unknown;
  snapshots: unknown[];
}): FinanceData | null {
  if (parsed.schemaVersion === 1) {
    const v2 = migrateV1ToV2(
      parsed as { schemaVersion: 1; snapshots: RawSnapshotV1[] }
    );
    return migrateV2ToV3(v2);
  }
  if (parsed.schemaVersion === 2) {
    return migrateV2ToV3(
      parsed as { schemaVersion: 2; snapshots: RawSnapshotV2[] }
    );
  }
  return null;
}

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
  if (data.schemaVersion === CURRENT_SCHEMA_VERSION) {
    return { status: "ok", data };
  }

  const migrated = migrateFinanceData(
    parsed as { schemaVersion: unknown; snapshots: unknown[] }
  );
  if (migrated) {
    return { status: "ok", data: migrated };
  }

  return { status: "version-mismatch", foundVersion: data.schemaVersion };
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
